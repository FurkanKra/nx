import {
  nxBaseCypressPreset,
  NxComponentTestingOptions,
} from '@nx/cypress/plugins/cypress-preset';
import {
  createExecutorContext,
  getProjectConfigByPath,
} from '@nx/cypress/internal';
import {
  ExecutorContext,
  readCachedProjectGraph,
  stripIndents,
} from '@nx/devkit';
import { getProjectSourceRoot } from '@nx/js/internal';
import { withReact } from '@nx/react';
import {
  assertPackageIsInstalled,
  suppressReactComposeHelperWarnings,
} from '@nx/react/internal';
import type { NormalizedWebpackExecutorOptions } from '@nx/webpack';
import { join } from 'path';

export function nxComponentTestingPreset(
  pathToConfig: string,
  options?: NxComponentTestingOptions
) {
  if (global.NX_GRAPH_CREATION) {
    // this is only used by plugins, so we don't need the component testing
    // options, cast to any to avoid type errors
    return nxBaseCypressPreset(pathToConfig) as any;
  }

  assertPackageIsInstalled('@nx/webpack', '@nx/next/plugins/component-testing');
  const {
    composePluginsSync,
    withNx,
  }: typeof import('@nx/webpack') = require('@nx/webpack');
  const {
    suppressWebpackComposeHelperWarnings,
  }: typeof import('@nx/webpack/internal') = require('@nx/webpack/internal');

  const graph = readCachedProjectGraph();
  const { targets: ctTargets, name: ctProjectName } = getProjectConfigByPath(
    graph,
    pathToConfig
  );
  const ctTargetName = options?.ctTargetName || 'component-test';
  const ctConfigurationName = process.env.NX_CYPRESS_TARGET_CONFIGURATION;
  const ctExecutorContext: ExecutorContext = createExecutorContext(
    graph,
    ctTargets,
    ctProjectName,
    ctTargetName,
    ctConfigurationName
  );

  const ctProjectConfig = graph.nodes[ctProjectName]?.data;

  if (!ctProjectConfig) {
    throw new Error(stripIndents`Unable to load project configs from the project graph.
Able to find CT project, ${!!ctProjectConfig}.`);
  }

  const webpackOptions: NormalizedWebpackExecutorOptions = {
    root: ctExecutorContext.root,
    projectRoot: ctProjectConfig.root,
    sourceRoot: getProjectSourceRoot(ctProjectConfig),
    main: '',
    useTsconfigPaths: undefined,
    fileReplacements: [],
    assets: [],
    outputPath: `dist/${ctProjectName}/.next`,
    outputFileName: 'main.js',
    compiler: options?.compiler || 'swc',
    tsConfig: join(
      ctExecutorContext.root,
      ctProjectConfig.root,
      'tsconfig.json'
    ),
  };
  // Nx composes these helpers internally for the Cypress CT preset; suppress
  // their deprecation warning so it fires only for user-authored configs.
  const webpackConfig = suppressWebpackComposeHelperWarnings(() =>
    suppressReactComposeHelperWarnings(() => {
      const configure = composePluginsSync(
        withNx({
          target: 'web',
          styles: [],
          scripts: [],
          postcssConfig: ctProjectConfig.root,
        }),
        withReact({})
      );
      return configure(
        {},
        {
          options: webpackOptions,
          context: ctExecutorContext,
        }
      );
    })
  );

  return {
    ...nxBaseCypressPreset(pathToConfig),
    specPattern: '**/*.cy.{js,jsx,ts,tsx}',
    devServer: {
      ...({ framework: 'react', bundler: 'webpack' } as const),
      webpackConfig,
    },
  };
}
