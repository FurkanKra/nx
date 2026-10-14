import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isWorkspacePackageManifest } from './migrate';

describe('isWorkspacePackageManifest', () => {
  let tmpRoot: string;
  let workspace: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), 'nx-installed-manifest-'));
    workspace = join(tmpRoot, 'workspace');
    mkdirSync(join(workspace, 'node_modules'), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpRoot, { recursive: true, force: true });
  });

  function writePackage(dir: string, name: string, version: string): string {
    mkdirSync(dir, { recursive: true });
    const manifestPath = join(dir, 'package.json');
    writeFileSync(manifestPath, JSON.stringify({ name, version }));
    return manifestPath;
  }

  // 'junction' keeps this working on Windows without elevated privileges and is
  // ignored on other platforms.
  function link(target: string, path: string): void {
    symlinkSync(target, path, 'junction');
  }

  it('accepts a package the workspace links to from outside the workspace', () => {
    // pnpm's `enableGlobalVirtualStore` shape: node_modules entries point at a
    // store that lives outside the workspace.
    const store = join(tmpRoot, 'store', 'nx');
    const manifestPath = writePackage(store, 'nx', '23.0.0');
    link(store, join(workspace, 'node_modules', 'nx'));

    // What `require.resolve` hands back here is the store path, which a plain
    // prefix check against the workspace rejects.
    expect(manifestPath.startsWith(workspace)).toBe(false);

    expect(isWorkspacePackageManifest(manifestPath, 'nx', workspace)).toBe(
      true
    );
  });

  it('rejects a package the workspace does not link to', () => {
    // A temp installation of Nx: outside the workspace and not linked to it.
    const tempInstall = join(tmpRoot, 'temp-install', 'node_modules', 'nx');
    const manifestPath = writePackage(tempInstall, 'nx', '23.3.0');

    expect(isWorkspacePackageManifest(manifestPath, 'nx', workspace)).toBe(
      false
    );
  });

  it('rejects a link that points at a different package than the one resolved', () => {
    const store = join(tmpRoot, 'store', 'nx');
    writePackage(store, 'nx', '23.0.0');
    link(store, join(workspace, 'node_modules', 'nx'));

    const other = join(tmpRoot, 'elsewhere', 'nx');
    const otherManifestPath = writePackage(other, 'nx', '22.0.0');

    expect(isWorkspacePackageManifest(otherManifestPath, 'nx', workspace)).toBe(
      false
    );
  });

  it('accepts a package linked from the .nx/installation require path', () => {
    const store = join(tmpRoot, 'store', '@nx', 'js');
    const manifestPath = writePackage(store, '@nx/js', '23.0.0');
    mkdirSync(join(workspace, '.nx', 'installation', 'node_modules', '@nx'), {
      recursive: true,
    });
    link(
      store,
      join(workspace, '.nx', 'installation', 'node_modules', '@nx', 'js')
    );

    expect(isWorkspacePackageManifest(manifestPath, '@nx/js', workspace)).toBe(
      true
    );
  });

  it('rejects a manifest path that does not exist', () => {
    expect(
      isWorkspacePackageManifest(
        join(tmpRoot, 'missing', 'package.json'),
        'nx',
        workspace
      )
    ).toBe(false);
  });
});
