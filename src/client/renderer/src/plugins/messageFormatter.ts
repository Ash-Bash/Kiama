import { ClientPlugin, TypedMessage } from '../types/plugin';

const allowedTags = new Set(['STRONG', 'EM', 'CODE', 'PRE', 'BR', 'A', 'IMG', 'UL', 'OL', 'LI', 'P', 'SPAN']);
const allowedAttributes: Record<string, Set<string>> = {
  A: new Set(['href', 'title', 'target', 'rel']),
  IMG: new Set(['src', 'alt', 'title'])
};

const escapeCode = (value: string) => value.replace(/</g, '&lt;').replace(/>/g, '&gt;');

const linkify = (value: string) =>
  value.replace(/(?:^|\s)(https?:\/\/[\w./?=#%&:;@\-+~]+[\w/#?=&-])/g, (match, url) => {
    const prefix = match.startsWith(' ') ? ' ' : '';
    return `${prefix}<a href="${url}">${url}</a>`;
  });

// Convert lightweight markdown-ish syntax to sanitized HTML snippets.
const formatMarkup = (content: string): string => {
  const codeBlockPattern = /```([\s\S]*?)```/g;
  let html = content.replace(codeBlockPattern, (_, code) => `<pre><code>${escapeCode(code)}</code></pre>`);

  html = html.replace(/`([^`]+)`/g, (_, code) => `<code>${escapeCode(code)}</code>`);
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  html = linkify(html);
  html = html.replace(/\n/g, '<br>');

  return sanitizeMarkup(html);
};

// Strip disallowed tags/attributes to avoid XSS while preserving basic markup.
const sanitizeMarkup = (html: string): string => {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const sanitizeNode = (node: Element | ChildNode) => {
    if (!(node instanceof Element)) return;

    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }

    Array.from(node.attributes).forEach(attr => {
      const allowed = allowedAttributes[node.tagName];
      if (!allowed || !allowed.has(attr.name)) {
        node.removeAttribute(attr.name);
        return;
      }

      if (node.tagName === 'A' && attr.name === 'href') {
        const href = attr.value.trim();
        const isHttp = /^https?:\/\//i.test(href) || href.startsWith('/');
        if (!isHttp) {
          node.removeAttribute('href');
        } else {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer');
        }
      }

      if (node.tagName === 'IMG' && attr.name === 'src') {
        const src = attr.value.trim();
        const isSafeSrc = /^https?:\/\//i.test(src) || src.startsWith('/') || src.startsWith('data:image/');
        if (!isSafeSrc) {
          node.removeAttribute('src');
        }
      }
    });

    Array.from(node.children).forEach(child => sanitizeNode(child));
  };

  Array.from(doc.body.children).forEach(child => sanitizeNode(child));
  return doc.body.innerHTML;
};

// Plugin that renders message content into sanitized HTML while leaving raw text intact for senders.
const messageFormatterPlugin: ClientPlugin = {
  name: 'Message Formatter',
  version: '1.1.0',
  init: (api) => {
    console.log('Message Formatter plugin initialized');

    // Convert basic markup to sanitized HTML for display
    api.addMessageHandler((message: TypedMessage) => {
      const formatted = formatMarkup(message.content || '');
      return {
        ...message,
        renderedContent: formatted
      };
    });
  }
};

export default messageFormatterPlugin;