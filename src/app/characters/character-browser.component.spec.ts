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
});
