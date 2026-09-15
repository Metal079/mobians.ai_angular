import { TestBed } from '@angular/core/testing';
import { ReferenceInputsComponent } from './reference-inputs.component';

describe('Reference video duration limits', () => {
  async function check(duration: number, maximum = 20, tolerance = 0.05) {
    TestBed.configureTestingModule({ imports: [ReferenceInputsComponent] });
    const fixture = TestBed.createComponent(ReferenceInputsComponent);
    const component = fixture.componentInstance;
    component.config = { reference_video_min_seconds: 0.25, reference_video_max_seconds: maximum,
      reference_video_duration_tolerance_seconds: tolerance } as any;
    component.showVideos = true;
    spyOn(URL, 'createObjectURL').and.returnValue('blob:reference-test');
    spyOn(URL, 'revokeObjectURL');
    spyOn<any>(component, 'metadata').and.resolveTo({ width: 128, height: 96, duration });
    await component.addFiles([new File(['0000ftyp0000'], 'reference.mp4', { type: 'video/mp4' })], 'video');
    fixture.detectChanges();
    return { fixture, component };
  }

  for (const duration of [20, 481 / 24]) {
    it(`accepts a ${duration}-second reference without changing its duration`, async () => {
      const { fixture, component } = await check(duration);
      expect(component.error).toBe('');
      expect(component.videos.length).toBe(1);
      expect(component.videos[0].duration).toBe(duration);
      expect(fixture.nativeElement.textContent).toContain('0.25–20 seconds');
      fixture.destroy();
    });
  }

  it('rejects a clip beyond the generated-frame tolerance', async () => {
    const { fixture, component } = await check(20.1);
    expect(component.videos.length).toBe(0);
    expect(component.error).toContain('20 seconds');
    expect(URL.revokeObjectURL).toHaveBeenCalled();
    fixture.destroy();
  });

  it('honors a server advertising a lower limit', async () => {
    const { fixture, component } = await check(16, 15, 0);
    expect(component.videos.length).toBe(0);
    expect(component.error).toContain('15 seconds');
    expect(fixture.nativeElement.textContent).toContain('0.25–15 seconds');
    fixture.destroy();
  });
});
