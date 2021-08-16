export const formatLocation = ({ locationText, coords }) => {
  const lat = parseLatOrLon(coords.lat);
  const lon = parseLatOrLon(coords.lon);

  const validCoords = lat && lon;

  return validCoords ? { title: locationText, lat, lon } : locationText;
};

const parseLatOrLon = (text) => {
  const result = parseFloat(text);
  return isNaN(result) ? null : result;
};
