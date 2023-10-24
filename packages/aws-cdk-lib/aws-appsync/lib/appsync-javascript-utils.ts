import { spawnSync, SpawnSyncOptions } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Code } from './code';
import { AppSyncBundlingOptions } from './types';
import { AssetHashType, BundlingOutput, DockerImage, FileSystem } from '../../core';

interface CallSite {
  getThis(): any
  getTypeName(): string
  getFunctionName(): string
  getMethodName(): string
  getFileName(): string
  getLineNumber(): number
  getColumnNumber(): number
  getFunction(): Function
  getEvalOrigin(): string
  isNative(): boolean
  isToplevel(): boolean
  isEval(): boolean
  isConstructor(): boolean
}

/**
 * Get callsites from the V8 stack trace API
 *
 * https://github.com/sindresorhus/callsites
 */
function callsites(): CallSite[] {
  const _prepareStackTrace = Error.prepareStackTrace;
  Error.prepareStackTrace = (_, stack) => stack;
  const stack = new Error().stack?.slice(1);
  Error.prepareStackTrace = _prepareStackTrace;
  return stack as unknown as CallSite[];
}

/**
 * Spawn sync with error handling
 */
function exec(cmd: string, args: string[], options?: SpawnSyncOptions) {
  const proc = spawnSync(cmd, args, options);

  if (proc.error) {
    throw proc.error;
  }

  if (proc.status !== 0) {
    if (proc.stdout || proc.stderr) {
      throw new Error(
        `[Status ${proc.status}] stdout: ${proc.stdout
          ?.toString()
          .trim()}\n\n\nstderr: ${proc.stderr?.toString().trim()}`,
      );
    }
    throw new Error(
      `${cmd} ${args.join(' ')} ${
        options?.cwd ? `run in directory ${options.cwd}` : ''
      } exited with status ${proc.status}`,
    );
  }

  return proc;
}

export function doBundling(entryFile: string, options: AppSyncBundlingOptions) {
  const { excludeSourcemap } = options;
  const sourceMap = excludeSourcemap ? '' : '--sourcemap=inline --sources-content=false';

  return Code.fromAsset('.', {
    assetHashType: AssetHashType.CUSTOM,
    assetHash: FileSystem.fingerprint(entryFile, { extraHash: JSON.stringify(options) }),
    bundling: {
      image: DockerImage.fromRegistry('dummy'), // only local with esbuild
      outputType: BundlingOutput.SINGLE_FILE,
      local: {
        tryBundle(outputDir) {
          const osPlatform = os.platform();
          exec(
            osPlatform === 'win32' ? 'cmd' : 'bash',
            [
              osPlatform === 'win32' ? '/c' : '-c',
              [
                'esbuild',
                '--bundle',
                `${sourceMap}`,
                '--target=esnext',
                '--platform=node',
                '--format=esm',
                '--external:@aws-appsync/utils',
                `--outdir=${outputDir}`,
                `${entryFile}`,
              ].join(' '),
            ],
            {
              env: { ...process.env },
              stdio: [
                // show output
                'ignore', // ignore stdio
                process.stderr, // redirect stdout to stderr
                'inherit', // inherit stderr
              ],
              windowsVerbatimArguments: osPlatform === 'win32',
            },
          );

          return true;
        },
      },
    },
  });
}

/**
 * Finds the name of the file where the AppSync JS resource is defined
 */
export function findDefiningFile(
  functionName: 'createJsResolver' | 'createJsFunction' | 'createJsPipelineResolver',
): string {
  let definingIndex;
  const sites = callsites();
  for (const [index, site] of sites.entries()) {
    if (site.getFunctionName() === functionName) {
      // The next site is the site where the AppSyncJsResolver was created
      definingIndex = index + 1;
      break;
    }
  }

  if (!definingIndex || !sites[definingIndex]) {
    throw new Error('Cannot find defining file.');
  }

  return sites[definingIndex].getFileName();
}

export function getResolverName(typeName: string, fieldName: string) {
  return `${typeName}${fieldName[0].toUpperCase() + fieldName.slice(1)}Resolver`;
}

/**
 * Searches for a resolver file. Preference order is the following:
 * 1. Given `${resolverFile}`
 * 2. A file named `${resolverDir}/${typeName}.{fieldName}.[ts|js]`
 * 3. A file named `resolvers/${typeName}.{fieldName}.[ts|js]` in the directory of the defining file.
 */
export function findResolverEntry(
  typeName: string,
  fieldName: string,
  resolverFile?: string,
  resolverDir?: string,
  isPipelineResolver?: boolean,
): string {
  if (resolverFile) {
    if (!/\.(js|ts)$/.test(resolverFile)) {
      throw new Error('Only JavaScript or TypeScript files are supported.');
    }
    if (!fs.existsSync(resolverFile)) {
      throw new Error(`Cannot find resolver file at ${resolverFile}`);
    }
    return resolverFile;
  }

  const dirname =
    resolverDir ??
    path.join(
      path.dirname(
        findDefiningFile(isPipelineResolver ? 'createJsPipelineResolver' : 'createJsResolver'),
      ),
      'resolvers',
    );

  const tsFile = path.join(dirname, `${typeName}.${fieldName}.ts`);
  if (fs.existsSync(tsFile)) {
    return tsFile;
  }

  const jsFile = path.join(dirname, `${typeName}.${fieldName}.js`);
  if (fs.existsSync(jsFile)) {
    return jsFile;
  }

  throw new Error(`Cannot find resolver file ${tsFile}, or ${jsFile}.`);
}

/**
 * Searches for function file. Preference order is the following:
 * 1. Given `${functionFile}`
 * 2. A file named `${functionDir}/${name}.[ts|js]`
 * 3. A file named `functions/${name}.[ts|js]` in the directory of the defining file.
 * Note: `name` can provide the file extension.
 */
export function findFunctionEntry(name: string, functionFile?: string, functionDir?: string): string {
  if (functionFile) {
    if (!/\.(js|ts)$/.test(functionFile)) {
      throw new Error('Only JavaScript or TypeScript files are supported.');
    }
    if (!fs.existsSync(functionFile)) {
      throw new Error(`Cannot find function file at ${functionFile}`);
    }
    return functionFile;
  }

  const dirname =
    functionDir ?? path.join(path.dirname(findDefiningFile('createJsPipelineResolver')), 'functions');

  let needsExtension = true;
  if (/\.\w+$/.test(name)) {
    if (!/\.(js|ts)$/.test(name)) {
      throw new Error('Only JavaScript or TypeScript files are supported.');
    }
    needsExtension = false;
  }

  const tsFile = path.join(dirname, `${name}${needsExtension ? '.ts' : ''}`);
  if (fs.existsSync(tsFile)) {
    return tsFile;
  }

  const jsFile = path.join(dirname, `${name}${needsExtension ? '.js' : ''}`);
  if (fs.existsSync(jsFile)) {
    return jsFile;
  }

  throw new Error(`Cannot find function file ${tsFile}, or ${jsFile}.`);
}

