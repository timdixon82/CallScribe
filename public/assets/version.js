(function showApplicationVersion() {
  const APP_VERSION = '0.2.10';

  function renderVersion() {
    document.querySelectorAll('[data-app-version]').forEach((element) => {
      element.textContent = `v${APP_VERSION}`;
    });
  }

  window.LOCAL_CALL_TRANSCRIBER_VERSION = APP_VERSION;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderVersion, { once: true });
  } else {
    renderVersion();
  }
}());
