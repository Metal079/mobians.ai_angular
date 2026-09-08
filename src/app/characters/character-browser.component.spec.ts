import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { CharactersService } from './characters.service';
import { CharacterBrowserComponent } from './character-browser.component';

describe('Character search browser', () => {
  let service: any;
  beforeEach(() => {
    service = { owner: 'alice', saved: new Subject(), list: jasmine.createSpy().and.resolveTo({ characters: [], next_cursor: null }), search: jasmine.createSpy().and.resolveTo({ items: [], next_cursor: null }) };
    TestBed.configureTestingModule({ imports: [CharacterBrowserComponent], providers: [{ provide: CharactersService, useValue: service }] });
  });
  it('debounces search and ignores a late response for an older query', fakeAsync(() => {
    const fixture = TestBed.createComponent(CharacterBrowserComponent), component = fixture.componentInstance;
    let old!: (value: any) => void;
    service.search.and.callFake((query: string) => query === 'spy amy' ? new Promise(done => old = done) : Promise.resolve({ items: [{ id: 'beach', character_id: 'amy', name: 'Amy Rose', recipe: { label: 'Beach day' } }], next_cursor: null }));
    component.search('spy amy'); tick(249); expect(service.search).not.toHaveBeenCalled(); tick(1);
    component.search('bikini amy rose'); tick(250);
    expect(component.rows()[0].id).toBe('beach');
    old({ items: [{ id:'spy' }], next_cursor: null }); tick();
    expect(component.rows()[0].id).toBe('beach');
    expect(component.choice(component.rows()[0])).toEqual({ characterId:'amy', imageId:'beach', name:'Amy Rose' });
    fixture.destroy();
  }));
  it('loads additional pages without duplicating cards and searches destinations on the server', async () => {
    const fixture = TestBed.createComponent(CharacterBrowserComponent), component = fixture.componentInstance;
    service.list.and.resolveTo({ characters:[{ id:'amy',name:'Amy' }], next_cursor:'next' });
    await component.load();
    service.list.and.resolveTo({ characters:[{ id:'amy',name:'Amy' },{ id:'ash',name:'Ash' }], next_cursor:null });
    await component.load(true);
    expect(service.list).toHaveBeenCalledWith('', 'next');
    expect(component.rows().map(r=>r.id)).toEqual(['amy','ash']);
    component.destinationsOnly = true; component.query = 'bikini amy';
    await component.load();
    expect(service.list).toHaveBeenCalledWith('bikini amy', undefined);
    expect(service.search).not.toHaveBeenCalled();
  });
  it('does not display an old account’s results', async () => {
    const fixture = TestBed.createComponent(CharacterBrowserComponent), component = fixture.componentInstance;
    let finish!: (value: any) => void;
    service.list.and.returnValue(new Promise(done => finish = done));
    const pending = component.load(); service.owner = 'bob';
    finish({ characters:[{ id:'private' }] }); await pending;
    expect(component.rows()).toEqual([]);
  });

  it('selects cards without opening a look, hides Create, and exposes the selected state', async () => {
    const fixture = TestBed.createComponent(CharacterBrowserComponent), component = fixture.componentInstance;
    fixture.detectChanges(); await fixture.whenStable();
    component.rows.set([{ id:'beach', character_id:'amy', name:'Amy Rose', recipe:{label:'Beach day'} }]);
    fixture.detectChanges(); expect(fixture.nativeElement.querySelector('.browser-delete')).toBeNull();
    component.showCreate = true; component.selectionMode = true; fixture.detectChanges();
    const toggle = spyOn(component.selectionToggle, 'emit'), choose = spyOn(component.chosen, 'emit');
    const card = fixture.nativeElement.querySelector('.picker-card') as HTMLButtonElement;
    card.click();
    expect(toggle).toHaveBeenCalledOnceWith({ characterId:'amy', imageId:'beach', name:'Amy Rose' });
    expect(choose).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.browser-create')).toBeNull();
    expect(card.getAttribute('aria-pressed')).toBe('false');
    component.selectedCharacterIds = ['amy']; fixture.detectChanges();
    expect(card.getAttribute('aria-pressed')).toBe('true');
    component.disabled = true; fixture.detectChanges();
    card.click(); expect(toggle).toHaveBeenCalledTimes(1);
    component.disabled = false; component.selectionMode = false; fixture.detectChanges(); card.click();
    expect(choose).toHaveBeenCalledOnceWith({ characterId:'amy', imageId:'beach', name:'Amy Rose' });
  });

  it('keeps parent selection through pagination and searches distinct characters', async () => {
    const fixture = TestBed.createComponent(CharacterBrowserComponent), component = fixture.componentInstance;
    component.selectionMode = true; component.destinationsOnly = true; component.selectedCharacterIds = ['amy'];
    service.list.and.resolveTo({ characters:[{id:'amy', name:'Amy'}], next_cursor:'next' });
    await component.load();
    service.list.and.resolveTo({ characters:[{id:'ash', name:'Ash'}], next_cursor:null });
    await component.load(true);
    expect(component.isSelected(component.rows()[0])).toBeTrue();
    component.query = 'bikini amy';
    service.list.and.resolveTo({ characters:[{id:'amy', name:'Amy'}], next_cursor:null });
    await component.load();
    expect(service.list).toHaveBeenCalledWith('bikini amy', undefined);
    expect(service.search).not.toHaveBeenCalled();
    expect(component.isSelected(component.rows()[0])).toBeTrue();
  });

  it('removes all looks for a deleted character while preserving search, pagination and other cards', async () => {
    const fixture = TestBed.createComponent(CharacterBrowserComponent), component = fixture.componentInstance;
    component.query = 'amy'; component.cursor.set('next-page');
    component.rows.set([{id:'beach',character_id:'amy'}, {id:'spy',character_id:'amy'}, {id:'other',character_id:'other'}]);
    let finish!: (value: any) => void;
    service.search.and.returnValue(new Promise(resolve => finish = resolve));
    const pending = component.load(true);
    component.removeCharacter('amy');
    finish({items:[{id:'late',character_id:'amy'}],next_cursor:null}); await pending;
    expect(component.rows()).toEqual([{id:'other',character_id:'other'}]);
    expect(component.query).toBe('amy'); expect(component.cursor()).toBe('next-page');
    expect(component.loading()).toBeFalse();
  });
});
