import { describe, expect, it } from 'vitest';
import { renderMarkdown } from '@/lib/markdown';

describe('renderMarkdown', () => {
  it('renders basic markdown', () => {
    const html = renderMarkdown('## Hi\n\nSome *text* and **more**.');
    expect(html).toContain('<h2>Hi</h2>');
    expect(html).toContain('<em>text</em>');
  });
  it('strips scripts, event handlers and javascript: links', () => {
    const html = renderMarkdown('[x](javascript:alert(3))\n\n<script>alert(1)</script><img src=x onerror="alert(2)"> <a href="https://ok.test" onclick="x()">ok</a>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/onerror|onclick/i);
    expect(html).not.toMatch(/javascript:/i);
  });
  it('blocks raw iframes and forms', () => {
    const html = renderMarkdown('<iframe src="https://evil.test"></iframe><form action="https://evil.test"><input></form>');
    expect(html).not.toMatch(/evil\.test/);
  });
  it('embeds a lone YouTube link through the privacy-friendly domain', () => {
    const html = renderMarkdown('Watch:\n\nhttps://www.youtube.com/watch?v=dQw4w9WgXcQ\n\nafter');
    expect(html).toContain('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
  });
  it('does not let hand-written placeholders smuggle in other iframes', () => {
    const html = renderMarkdown('<div class="video-embed" data-yt="abc"></div>');
    expect(html).not.toContain('<iframe');
  });
  it('opens external links safely in a new tab', () => {
    const html = renderMarkdown('[site](https://example.com)');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
  });
});
