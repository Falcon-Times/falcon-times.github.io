import { Marked } from 'marked';
import DOMPurify from 'dompurify';

const marked = new Marked({ gfm: true, breaks: false });

let hooked = false;
function ensureHooks() {
  if (hooked) return;
  hooked = true;
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      const href = node.getAttribute('href') ?? '';
      if (/^https?:/i.test(href)) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    }
    if (node.tagName === 'IMG') {
      node.setAttribute('loading', 'lazy');
      node.setAttribute('decoding', 'async');
    }
  });
}

const YT_LINE = /^[ \t]*https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/watch\?(?:[^\s]*&)?v=|youtu\.be\/)([\w-]{11})[^\s]*[ \t]*$/gm;
const YT_PLACEHOLDER = /<div class="video-embed" data-yt="([\w-]{11})"><\/div>/g;

/** A line containing only a YouTube link becomes an embedded player. */
function youtubeToPlaceholders(md: string): string {
  return md.replace(YT_LINE, (_m, id: string) => `\n<div class="video-embed" data-yt="${id}"></div>\n`);
}

function placeholdersToIframes(html: string): string {
  return html.replace(
    YT_PLACEHOLDER,
    (_m, id: string) =>
      `<div class="video-embed"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="YouTube video" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"></iframe></div>`,
  );
}

/** Markdown -> sanitized HTML. Safe to inject with dangerouslySetInnerHTML. */
export function renderMarkdown(md: string): string {
  ensureHooks();
  const raw = marked.parse(youtubeToPlaceholders(md), { async: false }) as string;
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'object', 'embed'],
    FORBID_ATTR: ['style'],
    ADD_ATTR: ['target'],
  });
  return placeholdersToIframes(clean);
}

export function stripMarkdown(md: string): string {
  return md.replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#>*_`~\[\]()-]/g, '').replace(/\s+/g, ' ').trim();
}
