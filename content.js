(() => {
  const SOURCE = 'rezka-dual-subs';
  const LANG = { RU: 'ru', EN: 'en' };

  const state = {
    settings: { enabled: true, swapOrder: false, fontSize: 28 },
    ruTrack: [],
    enTrack: [],
    currentVideo: null,
    mounted: false,
    root: null,
    lineTop: null,
    lineBottom: null,
    controls: null,
    rafId: null
  };

  const detectLanguageByUrl = (url = '') => {
    const value = url.toLowerCase();
    if (/(^|[\/_-])(ru|rus|russian)([\/_.-]|$)/.test(value)) return LANG.RU;
    if (/(^|[\/_-])(en|eng|english)([\/_.-]|$)/.test(value)) return LANG.EN;
    return null;
  };

  const ensureInjectedInterceptor = () => {
    if (document.getElementById('rezka-dual-subs-injected')) return;
    const script = document.createElement('script');
    script.id = 'rezka-dual-subs-injected';
    script.src = chrome.runtime.getURL('injected/interceptor.js');
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => script.remove();
  };

  const buildOverlay = () => {
    if (state.mounted) return;

    // 1. Слой субтитров
    const root = document.createElement('div');
    root.id = 'rezka-dual-subs-overlay';
    Object.assign(root.style, {
      position: 'absolute', left: '50%', bottom: '10%',
      transform: 'translateX(-50%)', textAlign: 'center',
      color: '#fff', textShadow: '0 2px 4px rgba(0,0,0,0.95)',
      fontSize: `${state.settings.fontSize}px`, zIndex: '2147483647',
      width: '90%', pointerEvents: 'none', fontFamily: 'Arial, sans-serif'
    });
    const top = document.createElement('div');
    const bottom = document.createElement('div');
    [top, bottom].forEach(el => Object.assign(el.style, { minHeight: '1.2em', margin: '2px 0' }));
    root.append(top, bottom);

    // 2. Панель настроек
    const controls = document.createElement('div');
    controls.id = 'rezka-dual-subs-controls';
    Object.assign(controls.style, {
      position: 'absolute', right: '10px', top: '10px',
      zIndex: '2147483648', background: 'rgba(20, 20, 20, 0.98)',
      color: '#fff', borderRadius: '8px', padding: '12px',
      fontSize: '13px', pointerEvents: 'auto',
      transition: 'opacity 0.3s ease, transform 0.3s ease', 
      opacity: '0', // ПОЛНОСТЬЮ ПРОЗРАЧНАЯ
      transform: 'scale(0.95)', // Немного уменьшена, когда скрыта
      boxShadow: '0 8px 25px rgba(0,0,0,0.9)', minWidth: '180px',
      cursor: 'move'
    });

    // Показываем только при наведении на область
    controls.onmouseenter = () => { 
      controls.style.opacity = '1'; 
      controls.style.transform = 'scale(1)'; 
    };
    controls.onmouseleave = () => { 
      controls.style.opacity = '0'; 
      controls.style.transform = 'scale(0.95)'; 
    };

    const title = document.createElement('div');
    title.textContent = '⚙ Настройки субтитров';
    title.style.cssText = 'font-weight: bold; border-bottom: 1px solid #444; margin-bottom: 10px; padding-bottom: 5px; font-size: 11px; color: #aaa;';

    const settingsBody = document.createElement('div');
    settingsBody.style.cssText = 'display: flex; flex-direction: column; gap: 10px;';

    const createSwitch = (text, key) => {
      const label = document.createElement('label');
      label.style.cssText = 'display: flex; align-items: center; gap: 10px; cursor: pointer; font-size: 13px;';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = state.settings[key];
      input.onchange = async () => { 
        state.settings[key] = input.checked; 
        await chrome.storage.sync.set(state.settings); 
        renderNow(); 
      };
      label.append(input, text);
      return label;
    };

    const sizeContainer = document.createElement('div');
    const sizeLabel = document.createElement('div');
    sizeLabel.textContent = `Размер шрифта: ${state.settings.fontSize}px`;
    sizeLabel.style.marginBottom = '5px';
    
    const sizeInput = document.createElement('input');
    sizeInput.type = 'range'; sizeInput.min = '18'; sizeInput.max = '50';
    sizeInput.value = state.settings.fontSize;
    sizeInput.style.width = '100%';
    sizeInput.oninput = () => {
      state.settings.fontSize = Number(sizeInput.value);
      root.style.fontSize = `${sizeInput.value}px`;
      sizeLabel.textContent = `Размер шрифта: ${sizeInput.value}px`;
    };
    sizeInput.onchange = () => chrome.storage.sync.set(state.settings);
    sizeContainer.append(sizeLabel, sizeInput);

    settingsBody.append(createSwitch('Включить', 'enabled'), createSwitch('Английский сверху', 'swapOrder'), sizeContainer);
    controls.append(title, settingsBody);

    // Логика перемещения (Drag)
    let active = false;
    let currentX, currentY, initialX, initialY;
    let xOffset = 0, yOffset = 0;

    controls.onmousedown = (e) => {
      if (e.target.tagName === 'INPUT') return;
      initialX = e.clientX - xOffset;
      initialY = e.clientY - yOffset;
      active = true;
    };

    document.onmouseup = () => active = false;
    document.onmousemove = (e) => {
      if (active) {
        e.preventDefault();
        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;
        xOffset = currentX;
        yOffset = currentY;
        controls.style.transform = `translate(${currentX}px, ${currentY}px)`;
      }
    };

    state.root = root;
    state.lineTop = top;
    state.lineBottom = bottom;
    state.controls = controls;
    state.mounted = true;
  };

  const findActiveCue = (track, timeMs) => track.find(i => i.start <= timeMs && i.end >= timeMs) || null;

  const renderNow = () => {
    if (!state.root || !state.currentVideo || !state.settings.enabled) {
      if (state.root) state.root.style.display = 'none';
      return;
    }
    state.root.style.display = 'block';
    const timeMs = Math.round(state.currentVideo.currentTime * 1000);
    const ru = findActiveCue(state.ruTrack, timeMs);
    const en = findActiveCue(state.enTrack, timeMs);
    
    state.lineTop.textContent = state.settings.swapOrder ? (en?.text || '') : (ru?.text || '');
    state.lineBottom.textContent = state.settings.swapOrder ? (ru?.text || '') : (en?.text || '');
  };

  const detectVideo = () => {
    const video = document.querySelector('video');
    if (video && state.currentVideo !== video) {
      state.currentVideo = video;
      const container = video.parentElement;
      if (container) {
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        container.appendChild(state.root);
        container.appendChild(state.controls);
      }
    }
  };

  const onSubtitlePayload = ({ url, text }) => {
    const track = window.RezkaSubtitleParser.parse(text, url.includes('.vtt') ? '.vtt' : '.srt');
    if (!track.length) return;
    const lang = detectLanguageByUrl(url) || (state.ruTrack.length ? LANG.EN : LANG.RU);
    if (lang === LANG.RU) state.ruTrack = track; else state.enTrack = track;
  };

  const boot = async () => {
    const stored = await chrome.storage.sync.get(['enabled', 'swapOrder', 'fontSize']);
    state.settings = { ...state.settings, ...stored };
    ensureInjectedInterceptor();
    buildOverlay();
    setInterval(detectVideo, 1000);
    window.addEventListener('message', e => {
      if (e.data?.source === SOURCE && e.data?.type === 'SUBTITLE_PAYLOAD') onSubtitlePayload(e.data.payload);
    });
    const loop = () => { renderNow(); requestAnimationFrame(loop); };
    loop();
  };

  boot();
})();