(() => {
  const sources = new WeakMap();
  const escape = (text) => {
    const node = document.createElement("span");
    node.textContent = text;
    return node.innerHTML;
  };
  const parser = new window.marked.Marked({
    gfm: true,
    breaks: false,
    renderer: {
      // Generated HTML is presented as source. Images use the verified media
      // pipeline; Markdown images are links, never automatic remote requests.
      html: ({ text }) => escape(text),
      image: ({ href, text }) => /^https?:\/\//i.test(href)
        ? `<a href="${escape(href).replaceAll('"', "&quot;")}">${escape(text || "查看图片")}</a>`
        : escape(text || "图片"),
    },
  });
  window.piMessageFormat = {
    source: (content) => sources.get(content) ?? content.textContent,
    render(content) {
      const source = content.textContent;
      // Preserve active selection and bound parsing work for unusually large
      // tool/model output. Such messages remain fully readable and copyable.
      const selection = window.getSelection();
      if (!source || source.length > 100000 || selection && !selection.isCollapsed &&
          (content.contains(selection.anchorNode) || content.contains(selection.focusNode))) return;
      try {
        const fragment = window.DOMPurify.sanitize(parser.parse(source, { async: false }), {
          ALLOWED_TAGS: ["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "strong", "em", "del", "ul", "ol", "li", "blockquote", "pre", "code", "hr", "a", "table", "thead", "tbody", "tr", "th", "td"],
          ALLOWED_ATTR: ["href", "title", "start"],
          ALLOW_DATA_ATTR: false,
          ALLOW_ARIA_ATTR: false,
          ALLOWED_URI_REGEXP: /^https?:\/\//i,
          RETURN_DOM_FRAGMENT: true,
        });
        for (const link of fragment.querySelectorAll("a")) {
          const href = link.getAttribute("href");
          if (!href || !/^https?:\/\//i.test(href)) { link.replaceWith(...link.childNodes); continue; }
          link.addEventListener("click", (event) => { event.preventDefault(); void window.piDesktop.openLink(href); });
        }
        for (const table of fragment.querySelectorAll("table")) {
          const scroll = document.createElement("div");
          scroll.className = "table-scroll";
          scroll.tabIndex = 0;
          scroll.setAttribute("role", "region");
          scroll.setAttribute("aria-label", "表格，可横向滚动");
          table.replaceWith(scroll);
          scroll.append(table);
        }
        sources.set(content, source);
        content.replaceChildren(fragment);
        content.classList.add("formatted");
      } catch {
        // A malformed reply must never prevent the rest of a session rendering.
        content.textContent = source;
      }
    },
  };
})();
