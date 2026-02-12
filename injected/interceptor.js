(() => {
  const SOURCE = 'rezka-dual-subs';
  const subtitlePattern = /(sub|subtitle|captions?|\.vtt|\.srt)/i;

  const looksLikeSubtitleRequest = (url, contentType = '') => {
    if (!url) return false;
    return subtitlePattern.test(url) || /vtt|srt/i.test(contentType);
  };

  const emitPayload = ({ url, text, contentType }) => {
    if (!text || !looksLikeSubtitleRequest(url, contentType)) return;

    window.postMessage(
      {
        source: SOURCE,
        type: 'SUBTITLE_PAYLOAD',
        payload: {
          url,
          text,
          contentType
        }
      },
      '*'
    );
  };

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const response = await originalFetch(...args);

    try {
      const requestUrl = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      const contentType = response.headers.get('content-type') || '';
      if (looksLikeSubtitleRequest(requestUrl, contentType)) {
        const text = await response.clone().text();
        emitPayload({ url: requestUrl, text, contentType });
      }
    } catch (_) {
      // no-op
    }

    return response;
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function open(method, url, ...rest) {
    this.__rezkaDualSubsUrl = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function send(...args) {
    this.addEventListener('load', () => {
      try {
        const contentType = this.getResponseHeader('content-type') || '';
        if (!looksLikeSubtitleRequest(this.__rezkaDualSubsUrl, contentType)) return;
        if (typeof this.responseText !== 'string') return;

        emitPayload({
          url: this.__rezkaDualSubsUrl,
          text: this.responseText,
          contentType
        });
      } catch (_) {
        // no-op
      }
    });

    return originalSend.call(this, ...args);
  };
})();
