import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild, ViewEncapsulation, output, signal } from '@angular/core';
import { baseKeymap, toggleMark } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { DOMSerializer, Fragment, Mark, Node as EditorNode, Schema } from 'prosemirror-model';
import { EditorState, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { announcementImageUrl, imageSource, readAnnouncementHtml } from 'src/app/whats-new/announcement-body.component';

const schema = new Schema({
  nodes: {
    doc: { content: 'paragraph+' },
    paragraph: { content: 'inline*', parseDOM: [{ tag: 'p' }, { tag: 'div' }], toDOM: () => ['p', 0] },
    text: { group: 'inline' },
    hard_break: { inline: true, group: 'inline', selectable: false, parseDOM: [{ tag: 'br' }], toDOM: () => ['br'] },
    image: {
      inline: true, group: 'inline', draggable: true, attrs: { src: {}, alt: { default: '' } },
      parseDOM: [{ tag: 'img[src]', getAttrs: el => {
        const src = imageSource(el.getAttribute('src'));
        return src ? { src, alt: el.getAttribute('alt') || '' } : false;
      } }],
      toDOM: node => ['img', { src: node.attrs['src'], alt: node.attrs['alt'] }]
    }
  },
  marks: {
    bold: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }, { style: 'font-weight', getAttrs: v => /^(bold|[6-9]00)$/.test(v) ? null : false }], toDOM: () => ['strong', 0] },
    italic: { parseDOM: [{ tag: 'em' }, { tag: 'i' }, { style: 'font-style=italic' }], toDOM: () => ['em', 0] }
  }
});
const serializer = DOMSerializer.fromSchema(schema);
const shortcuts = keymap({
  'Mod-b': toggleMark(schema.marks['bold']), 'Mod-i': toggleMark(schema.marks['italic']),
  'Mod-z': undo, 'Shift-Mod-z': redo, 'Mod-y': redo,
  'Shift-Enter': (state, dispatch) => {
    dispatch?.(state.tr.replaceSelectionWith(schema.nodes['hard_break'].create()).scrollIntoView());
    return true;
  }
});
const imagePath = '/announcement-images/';

function editorDocument(body: string, html?: string | null): EditorNode {
  const parts = html ? readAnnouncementHtml(html) : [{ text: body, bold: false, italic: false, image: undefined }];
  const paragraphs: EditorNode[][] = [[]];
  for (const part of parts) {
    if (part.image) {
      paragraphs[paragraphs.length - 1].push(schema.nodes['image'].create({ src: part.image, alt: part.text }));
      continue;
    }
    const marks: Mark[] = [];
    if (part.bold) marks.push(schema.marks['bold'].create());
    if (part.italic) marks.push(schema.marks['italic'].create());
    part.text.split('\n').forEach((line, i) => {
      if (i) paragraphs.push([]);
      if (line) paragraphs[paragraphs.length - 1].push(schema.text(line, marks));
    });
  }
  return schema.topNodeType.create(null, paragraphs.map(nodes => schema.nodes['paragraph'].create(null, nodes)));
}

@Component({
  selector: 'app-announcement-editor',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './announcement-editor.component.html',
  styleUrls: ['./announcement-editor.component.css']
})
export class AnnouncementEditorComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mount', { static: true }) private mount!: ElementRef<HTMLElement>;
  readonly changed = output<{ body: string; body_html?: string }>();
  readonly error = signal('');
  readonly bold = signal(false);
  readonly italic = signal(false);
  private view!: EditorView;
  private files = new Map<string, { file: File; preview: string }>();

  ngAfterViewInit(): void {
    this.view = new EditorView(this.mount.nativeElement, {
      state: this.state('', null),
      attributes: { role: 'textbox', 'aria-label': 'Post text', 'aria-multiline': 'true', 'aria-describedby': 'announcement-image-help' },
      nodeViews: { image: node => {
        const dom = document.createElement('img');
        const src = node.attrs['src'];
        dom.referrerPolicy = 'no-referrer';
        dom.alt = node.attrs['alt'];
        dom.src = this.files.get(src)?.preview ?? announcementImageUrl(src);
        return { dom };
      } },
      handleDOMEvents: {
        drop: (view, event) => {
          if (!event.dataTransfer?.files.length) return false;
          event.preventDefault();
          const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
          this.attach(event.dataTransfer.files, pos);
          return true;
        },
        paste: (_view, event) => {
          if (!event.clipboardData?.files.length) return false;
          event.preventDefault();
          this.attach(event.clipboardData.files);
          return true;
        }
      },
      dispatchTransaction: tr => {
        const state = this.view.state.apply(tr);
        this.view.updateState(state);
        this.updateButtons();
        if (tr.docChanged) this.reportBody(state.doc);
      }
    });
  }

  private state(body: string, html?: string | null): EditorState {
    return EditorState.create({ doc: editorDocument(body, html), plugins: [history(), shortcuts, keymap(baseKeymap)] });
  }

  load(body: string, html?: string | null): void {
    this.clearFiles();
    this.error.set('');
    this.view.updateState(this.state(body, html));
    this.updateButtons();
  }

  format(name: 'bold' | 'italic'): void {
    toggleMark(schema.marks[name])(this.view.state, this.view.dispatch);
    this.view.focus();
  }

  private updateButtons(): void {
    const { selection, storedMarks, doc } = this.view.state;
    const active = (name: string) => selection.empty
      ? !!schema.marks[name].isInSet(storedMarks ?? selection.$from.marks())
      : doc.rangeHasMark(selection.from, selection.to, schema.marks[name]);
    this.bold.set(active('bold'));
    this.italic.set(active('italic'));
  }

  choose(input: HTMLInputElement): void {
    if (input.files?.length) this.attach(input.files);
    input.value = '';
  }

  private attach(list: FileList, pos?: number): void {
    const selected = Array.from(list);
    if (selected.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)) {
      this.error.set('Choose PNG, JPEG or WebP images up to 10 MB each.');
      return;
    }
    const files = [...this.attachments().values(), ...selected];
    if (files.length > 8 || files.reduce((sum, file) => sum + file.size, 0) > 24 * 1024 * 1024) {
      this.error.set('Add up to eight new images totaling 24 MB per save.');
      return;
    }
    const nodes = selected.map(file => {
      const src = imagePath + crypto.randomUUID();
      this.files.set(src, { file, preview: URL.createObjectURL(file) });
      return schema.nodes['image'].create({ src, alt: file.name.replace(/\.[^.]+$/, '').slice(0, 100) });
    });
    const tr = this.view.state.tr;
    if (pos !== undefined) tr.setSelection(TextSelection.near(tr.doc.resolve(pos)));
    tr.replaceWith(tr.selection.from, tr.selection.to, Fragment.fromArray(nodes));
    this.view.dispatch(tr.scrollIntoView());
    this.view.focus();
    this.error.set('');
  }

  attachments(): Map<string, File> {
    const used = new Map<string, File>();
    this.view.state.doc.descendants(node => {
      const src = node.attrs['src'];
      const pending = this.files.get(src);
      if (pending) used.set(src.slice(imagePath.length), pending.file);
    });
    return used;
  }

  private reportBody(doc: EditorNode): void {
    const lines: string[] = [];
    let rich = false;
    doc.forEach(paragraph => {
      const container = document.createElement('template');
      container.content.append(serializer.serializeFragment(paragraph.content, { document: container.content.ownerDocument }));
      lines.push(container.innerHTML);
      paragraph.forEach(node => { if (node.marks.length || node.type.name === 'image') rich = true; });
    });
    const body = doc.textBetween(0, doc.content.size, '\n', node =>
      node.type.name === 'image' ? ' ' + (node.attrs['alt'] || '[Image]') + ' ' : '\n');
    this.changed.emit({ body, body_html: rich ? lines.join('\n') : undefined });
  }

  private clearFiles(): void {
    this.files.forEach(entry => URL.revokeObjectURL(entry.preview));
    this.files.clear();
  }

  ngOnDestroy(): void {
    this.view?.destroy();
    this.clearFiles();
  }
}
