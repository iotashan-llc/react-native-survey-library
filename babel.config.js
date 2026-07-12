// Function patterns ONLY in this file. Expo SDK 57's metro-transform-worker
// computes its cache key by loading the discovered babel config chain with
// NO filename and NO caller; any string/RegExp 'include'/'exclude'/'test'
// throws ("Configuration contains string/RegExp pattern, but no filename was
// passed to Babel"). Function patterns receive filename|undefined and are
// exempt. jest (which always passes filenames) works with either form.
const isNodeModules = (filename) =>
  typeof filename === 'string' && filename.includes('/node_modules/');

module.exports = function (api) {
  api.cache(true);
  return {
    overrides: [
      {
        test: (filename) => !isNodeModules(filename),
        presets: ['module:react-native-builder-bob/babel-preset'],
      },
      {
        test: (filename) => isNodeModules(filename),
        presets: ['module:@react-native/babel-preset'],
      },
    ],
  };
};
