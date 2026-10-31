const { withPodfile } = require('@expo/config-plugins');

const MARKER = '# YOUMBIA_XCODE27_PODS_DEPLOYMENT_TARGET';

module.exports = function withIos27Pods(config) {
  return withPodfile(config, (config) => {
    const source = config.modResults.contents;

    if (source.includes(MARKER)) {
      return config;
    }

    const matches = [
      ...source.matchAll(/react_native_post_install\([\s\S]*?\n([ \t]*)\)/g)
    ];

    if (matches.length !== 1) {
      throw new Error('Expected exactly one react_native_post_install');
    }

    const match = matches[0];
    const position = match.index + match[0].length;
    const indent = match[1];

    const lines = [
      MARKER,
      'installer.pods_project.targets.each do |target|',
      '  target.build_configurations.each do |cfg|',
      "    value = cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET']",
      '    if value.nil? || value.to_f < 15.1',
      "      cfg.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.1'",
      '    end',
      '  end',
      'end',
    ];

    const block = '\n\n' + lines.map(
      line => indent + line
    ).join('\n');

    config.modResults.contents =
      source.slice(0, position) +
      block +
      source.slice(position);

    return config;
  });
};
