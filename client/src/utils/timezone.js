const ADDIS_ABABA_TIMEZONE = 'Africa/Addis_Ababa';

let patched = false;

function withDefaultTimeZone(options) {
  if (!options || typeof options !== 'object') {
    return { timeZone: ADDIS_ABABA_TIMEZONE };
  }

  if (options.timeZone) {
    return options;
  }

  return { ...options, timeZone: ADDIS_ABABA_TIMEZONE };
}

export function configureDisplayTimeZone() {
  if (patched) return;

  const nativeToLocaleString = Date.prototype.toLocaleString;
  const nativeToLocaleDateString = Date.prototype.toLocaleDateString;
  const nativeToLocaleTimeString = Date.prototype.toLocaleTimeString;

  Date.prototype.toLocaleString = function toLocaleStringPatched(locales, options) {
    return nativeToLocaleString.call(this, locales, withDefaultTimeZone(options));
  };

  Date.prototype.toLocaleDateString = function toLocaleDateStringPatched(locales, options) {
    return nativeToLocaleDateString.call(this, locales, withDefaultTimeZone(options));
  };

  Date.prototype.toLocaleTimeString = function toLocaleTimeStringPatched(locales, options) {
    return nativeToLocaleTimeString.call(this, locales, withDefaultTimeZone(options));
  };

  patched = true;
}

export { ADDIS_ABABA_TIMEZONE };
