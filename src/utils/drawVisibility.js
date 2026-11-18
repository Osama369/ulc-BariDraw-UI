// When the draw stops taking entries. An admin can reopen a closed draw until
// a later time; the server sends that as closesAt.
export const getDrawClosesAt = (draw) => {
  if (!draw) return null;
  const raw = draw.closesAt || draw.draw_date;
  const t = raw ? new Date(raw).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

export const isDrawExpired = (draw) => {
  if (!draw) return false;

  if (draw.isExpired === true) return true;

  if (typeof draw.remainingMs === 'number') {
    return draw.remainingMs <= 0;
  }

  const closesAt = getDrawClosesAt(draw);
  if (closesAt != null) return closesAt <= Date.now();

  return false;
};

// Sell Department: only active and non-expired draws are selectable.
export const isDrawVisibleForSell = (draw) => {
  return !!draw && !!draw.isActive && !isDrawExpired(draw);
};

// History/report modules: include active draws and expired draws.
// This hides only deactivated non-expired draws.
export const isDrawVisibleForHistory = (draw) => {
  return !!draw && (isDrawExpired(draw) || !!draw.isActive);
};

export const formatDrawOptionLabel = (draw, { includeStatus = true } = {}) => {
  if (!draw) return '';

  const title = (draw.title || 'Draw').trim();
  const isPakistan = String(draw.category || '').toUpperCase() === 'PAKISTAN';
  const serialNo = draw.serialNoDisplay || (draw.serialNo ? `0${draw.serialNo}`.slice(-2) : '');
  const drawNo = isPakistan && draw.drawNo ? String(draw.drawNo) : '';
  const city = (draw.city || '').trim();
  const dateText = draw.draw_date ? new Date(draw.draw_date).toLocaleDateString() : '';

  const idChunk = [
    serialNo ? `S#${serialNo}` : '',
    drawNo ? `D#${drawNo}` : '',
  ].filter(Boolean).join(' / ');

  const core = [
    idChunk ? `${title} (${idChunk})` : title,
    city,
    dateText,
  ].filter(Boolean).join(' - ');

  if (!includeStatus) return core;

  const statusText = isDrawExpired(draw)
    ? 'Closed'
    : (draw.isReopened ? 'Reopened' : (draw.isActive ? 'Active' : 'Inactive'));

  return `${core} (${statusText})`;
};
