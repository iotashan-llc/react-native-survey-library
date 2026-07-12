module.exports = function (api) {
  // Metro (the example app) must never consume this config — its RegExp
  // overrides break metro-transform-worker's filename-less cache-key pass
  // ("Configuration contains string/RegExp pattern, but no filename was
  // passed to Babel"). The example's own babel.config.js (builder-bob
  // getConfig + babel-preset-expo) fully owns Metro transforms; this file
  // exists for jest at the library root.
  const isMetro = api.caller((c) => !!c && c.name === 'metro');
  api.cache(true);
  if (isMetro) return {};
  return {
    overrides: [
      {
        exclude: /\/node_modules\//,
        presets: ['module:react-native-builder-bob/babel-preset'],
      },
      {
        include: /\/node_modules\//,
        presets: ['module:@react-native/babel-preset'],
      },
    ],
  };
};
