const path = require('path');

const root = path.resolve(__dirname, '..');
const srcDir = path.join(root, 'src') + path.sep;

module.exports = function (api) {
  api.cache(true);

  return {
    presets: ['babel-preset-expo'],
    overrides: [
      {
        // Library source pulled into the bundle via the monorepo alias.
        // MUST be a FUNCTION pattern: string/RegExp patterns throw in
        // Expo SDK 57's metro-transform-worker cache-key pass, which loads
        // this config with no filename ("Configuration contains
        // string/RegExp pattern, but no filename was passed to Babel").
        // Mirrors react-native-builder-bob/babel-config's string include.
        test: (filename) => !!filename && filename.startsWith(srcDir),
        presets: [
          [
            require.resolve(
              'react-native-builder-bob/babel-preset'
            ),
            { supportsStaticESM: true },
          ],
        ],
      },
    ],
  };
};
