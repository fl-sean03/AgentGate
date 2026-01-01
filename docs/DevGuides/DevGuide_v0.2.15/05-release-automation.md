# 05: Release Automation - Thrust 7

## Thrust 7: Release Workflow Enhancement

### 7.1 Objective

Create a robust, automated release workflow that produces versioned releases with proper validation, changelog generation, and artifact publishing.

### 7.2 Background

Current release workflow has:
- Tag-triggered releases
- Basic validation
- npm publish step
- GitHub release creation

Improvements needed:
- Better changelog generation
- Release candidate support
- Rollback capability
- SBOM generation
- Clearer versioning

### 7.3 Subtasks

#### 7.3.1 Enhance Version Validation

Add comprehensive version checking:

```yaml
validate:
  name: Validate Release
  runs-on: ubuntu-latest
  outputs:
    version: ${{ steps.version.outputs.version }}
    tag: ${{ steps.version.outputs.tag }}
    prerelease: ${{ steps.version.outputs.prerelease }}
    channel: ${{ steps.version.outputs.channel }}
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0  # Full history for changelog

    - name: Determine version
      id: version
      run: |
        if [[ "${{ github.event_name }}" == "workflow_dispatch" ]]; then
          VERSION="${{ github.event.inputs.version }}"
        else
          VERSION="${GITHUB_REF#refs/tags/v}"
        fi

        # Validate semver format
        if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.]+)?$ ]]; then
          echo "::error::Invalid version format: $VERSION"
          exit 1
        fi

        # Determine if prerelease
        if [[ "$VERSION" =~ -alpha|beta|rc ]]; then
          echo "prerelease=true" >> $GITHUB_OUTPUT
          if [[ "$VERSION" =~ -alpha ]]; then
            echo "channel=alpha" >> $GITHUB_OUTPUT
          elif [[ "$VERSION" =~ -beta ]]; then
            echo "channel=beta" >> $GITHUB_OUTPUT
          elif [[ "$VERSION" =~ -rc ]]; then
            echo "channel=rc" >> $GITHUB_OUTPUT
          fi
        else
          echo "prerelease=false" >> $GITHUB_OUTPUT
          echo "channel=latest" >> $GITHUB_OUTPUT
        fi

        echo "version=$VERSION" >> $GITHUB_OUTPUT
        echo "tag=v$VERSION" >> $GITHUB_OUTPUT

    - name: Check version consistency
      run: |
        PKG_VERSION=$(node -p "require('./package.json').version")
        RELEASE_VERSION="${{ steps.version.outputs.version }}"

        if [[ "$PKG_VERSION" != "$RELEASE_VERSION" ]]; then
          echo "::error::package.json version ($PKG_VERSION) doesn't match release ($RELEASE_VERSION)"
          echo "::error::Update package.json first: pnpm version $RELEASE_VERSION --no-git-tag-version"
          exit 1
        fi

    - name: Check tag doesn't exist
      run: |
        if git rev-parse "${{ steps.version.outputs.tag }}" >/dev/null 2>&1; then
          echo "::error::Tag ${{ steps.version.outputs.tag }} already exists"
          exit 1
        fi
```

#### 7.3.2 Improve Changelog Generation

Generate a proper changelog from commits:

```yaml
- name: Generate changelog
  id: changelog
  run: |
    # Get previous tag
    PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

    # Start changelog
    echo "## What's Changed" > changelog.md
    echo "" >> changelog.md

    if [[ -n "$PREV_TAG" ]]; then
      echo "### Commits since $PREV_TAG" >> changelog.md
      echo "" >> changelog.md

      # Group by type based on conventional commits
      echo "#### Features" >> changelog.md
      git log --pretty=format:"- %s (%h)" "$PREV_TAG"..HEAD | grep "^- feat:" >> changelog.md || true
      echo "" >> changelog.md

      echo "#### Bug Fixes" >> changelog.md
      git log --pretty=format:"- %s (%h)" "$PREV_TAG"..HEAD | grep "^- fix:" >> changelog.md || true
      echo "" >> changelog.md

      echo "#### Other Changes" >> changelog.md
      git log --pretty=format:"- %s (%h)" "$PREV_TAG"..HEAD | grep -v "^- feat:\|^- fix:" >> changelog.md || true
      echo "" >> changelog.md
    else
      echo "Initial release" >> changelog.md
    fi

    echo "" >> changelog.md
    echo "**Full Changelog**: https://github.com/${{ github.repository }}/compare/$PREV_TAG...${{ steps.version.outputs.tag }}" >> changelog.md
```

#### 7.3.3 Add Release Build with Verification

```yaml
build:
  name: Build Release
  runs-on: ubuntu-latest
  needs: validate
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4
      with:
        version: ${{ env.PNPM_VERSION }}

    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'pnpm'
        registry-url: 'https://registry.npmjs.org'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Run full validation
      run: |
        pnpm typecheck
        pnpm lint
        git config --global user.email "ci@agentgate.dev"
        git config --global user.name "AgentGate CI"
        pnpm --filter @agentgate/shared build
        pnpm test

    - name: Build all packages
      run: pnpm build

    - name: Verify build output
      run: |
        # Check server build
        test -f packages/server/dist/index.js || exit 1

        # Check dashboard build
        test -d packages/dashboard/dist || exit 1

        # Check shared build
        test -f packages/shared/dist/index.js || exit 1

        echo "All build outputs verified"

    - name: Create package tarballs
      run: |
        cd packages/server && pnpm pack && mv *.tgz ../../
        cd ../shared && pnpm pack && mv *.tgz ../../

    - name: Generate SBOM
      uses: anchore/sbom-action@v0
      with:
        path: .
        output-file: sbom.spdx.json
        format: spdx-json

    - name: Upload release artifacts
      uses: actions/upload-artifact@v4
      with:
        name: release-${{ needs.validate.outputs.version }}
        path: |
          packages/*/dist/
          *.tgz
          sbom.spdx.json
        retention-days: 30
```

#### 7.3.4 Create GitHub Release

```yaml
github-release:
  name: GitHub Release
  runs-on: ubuntu-latest
  needs: [validate, build]
  if: |
    github.event_name == 'push' ||
    (github.event_name == 'workflow_dispatch' && github.event.inputs.dry_run != 'true')
  permissions:
    contents: write
  steps:
    - uses: actions/checkout@v4
      with:
        fetch-depth: 0

    - name: Download artifacts
      uses: actions/download-artifact@v4
      with:
        name: release-${{ needs.validate.outputs.version }}
        path: release/

    - name: Generate changelog
      run: |
        PREV_TAG=$(git describe --tags --abbrev=0 HEAD^ 2>/dev/null || echo "")

        cat > changelog.md << 'CHANGELOG_EOF'
        ## AgentGate ${{ needs.validate.outputs.tag }}

        ### Installation

        ```bash
        npm install -g @agentgate/server@${{ needs.validate.outputs.version }}
        ```

        ### What's Changed
        CHANGELOG_EOF

        if [[ -n "$PREV_TAG" ]]; then
          git log --pretty=format:"- %s (%h)" "$PREV_TAG"..HEAD >> changelog.md
        fi

        echo "" >> changelog.md
        echo "---" >> changelog.md
        echo "See [full changelog](https://github.com/${{ github.repository }}/compare/$PREV_TAG...${{ needs.validate.outputs.tag }}) for all changes." >> changelog.md

    - name: Create Release
      uses: softprops/action-gh-release@v2
      with:
        tag_name: ${{ needs.validate.outputs.tag }}
        name: AgentGate ${{ needs.validate.outputs.tag }}
        body_path: changelog.md
        draft: false
        prerelease: ${{ needs.validate.outputs.prerelease }}
        files: |
          release/*.tgz
          release/sbom.spdx.json
      env:
        GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 7.3.5 Publish to npm

```yaml
npm-publish:
  name: Publish to npm
  runs-on: ubuntu-latest
  needs: [validate, build, github-release]
  if: |
    github.event_name == 'push' ||
    (github.event_name == 'workflow_dispatch' && github.event.inputs.dry_run != 'true')
  steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v4
      with:
        version: ${{ env.PNPM_VERSION }}

    - uses: actions/setup-node@v4
      with:
        node-version: ${{ env.NODE_VERSION }}
        cache: 'pnpm'
        registry-url: 'https://registry.npmjs.org'

    - name: Install and build
      run: |
        pnpm install --frozen-lockfile
        pnpm build

    - name: Publish shared package
      run: |
        cd packages/shared
        pnpm publish --tag ${{ needs.validate.outputs.channel }} --no-git-checks
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
      continue-on-error: true

    - name: Publish server package
      run: |
        cd packages/server
        pnpm publish --tag ${{ needs.validate.outputs.channel }} --no-git-checks
      env:
        NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

#### 7.3.6 Add Release Summary

```yaml
notify:
  name: Release Summary
  runs-on: ubuntu-latest
  needs: [validate, build, github-release, npm-publish]
  if: always()
  steps:
    - name: Create summary
      run: |
        cat >> $GITHUB_STEP_SUMMARY << 'EOF'
        ## Release Summary: ${{ needs.validate.outputs.tag }}

        | Component | Status |
        |-----------|--------|
        | Validation | ${{ needs.validate.result }} |
        | Build | ${{ needs.build.result }} |
        | GitHub Release | ${{ needs.github-release.result }} |
        | npm Publish | ${{ needs.npm-publish.result }} |

        ### Release Details

        - **Version**: ${{ needs.validate.outputs.version }}
        - **Tag**: ${{ needs.validate.outputs.tag }}
        - **Channel**: ${{ needs.validate.outputs.channel }}
        - **Prerelease**: ${{ needs.validate.outputs.prerelease }}

        ### Links

        - [GitHub Release](https://github.com/${{ github.repository }}/releases/tag/${{ needs.validate.outputs.tag }})
        - [npm Package](https://www.npmjs.com/package/@agentgate/server/v/${{ needs.validate.outputs.version }})
        EOF
```

### 7.4 Verification Steps

1. Test dry-run release:
   ```bash
   gh workflow run release.yml -f version=0.3.0-test.1 -f dry_run=true
   ```

2. Check validation catches mismatched versions:
   ```bash
   # Don't update package.json
   git tag v0.99.0
   git push origin v0.99.0
   # Should fail with version mismatch error
   ```

3. Verify changelog generation:
   ```bash
   git log --pretty=format:"- %s (%h)" v0.2.7..v0.2.8
   ```

4. Test prerelease detection:
   ```bash
   gh workflow run release.yml -f version=0.3.0-rc.1 -f dry_run=true
   # Check that prerelease=true and channel=rc
   ```

### 7.5 Files Created/Modified

| File | Action |
|------|--------|
| `.github/workflows/release.yml` | Modified - Enhanced workflow |

---

## Release Process Documentation

### How to Create a Release

1. **Update version in package.json files:**
   ```bash
   # For all packages
   pnpm version 0.3.0 --no-git-tag-version
   ```

2. **Commit version bump:**
   ```bash
   git add -A
   git commit -m "chore: bump version to 0.3.0"
   git push origin main
   ```

3. **Create and push tag:**
   ```bash
   git tag v0.3.0
   git push origin v0.3.0
   ```

4. **Monitor release workflow:**
   ```bash
   gh run watch
   ```

### Release Channels

| Channel | Tag Format | npm Tag | Use Case |
|---------|------------|---------|----------|
| latest | v1.2.3 | latest | Stable releases |
| rc | v1.2.3-rc.1 | rc | Release candidates |
| beta | v1.2.3-beta.1 | beta | Beta testing |
| alpha | v1.2.3-alpha.1 | alpha | Early access |

### Rollback Procedure

If a release needs to be rolled back:

1. **Deprecate npm version:**
   ```bash
   npm deprecate @agentgate/server@0.3.0 "Critical bug, use 0.2.8"
   ```

2. **Delete GitHub release:**
   ```bash
   gh release delete v0.3.0 --yes
   ```

3. **Delete git tag:**
   ```bash
   git tag -d v0.3.0
   git push origin :refs/tags/v0.3.0
   ```

4. **Publish hotfix:**
   ```bash
   git checkout -b hotfix/0.3.1
   # Fix the issue
   pnpm version 0.3.1 --no-git-tag-version
   # PR, merge, tag, release
   ```

---

## Thrust 7 Verification Checklist

- [ ] Version validation catches format errors
- [ ] Version mismatch with package.json fails
- [ ] Changelog generates correctly
- [ ] Prerelease versions use correct npm tag
- [ ] SBOM is included in release
- [ ] GitHub release has all assets
- [ ] npm publish succeeds
- [ ] Release summary shows all statuses
