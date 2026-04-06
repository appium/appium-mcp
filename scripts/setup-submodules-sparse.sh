#!/bin/bash
# Setup sparse-checkout for Git submodules to only checkout .md and image files

set -e

SUBMODULES=(
  "src/resources/submodules/appium"
  "src/resources/submodules/appium-skills"
  "src/resources/submodules/appium-uiautomator2-driver"
  "src/resources/submodules/appium-xcuitest-driver"
)

configure_sparse_checkout() {
  local submodule_path=$1
  echo "Configuring sparse-checkout for $submodule_path..."
  
  cd "$submodule_path"
  
  # Initialize sparse-checkout in non-cone mode
  git sparse-checkout init --no-cone
  
  # Get the actual git directory path (handles submodules correctly)
  GIT_DIR=$(git rev-parse --git-dir)
  
  # Add patterns for markdown and image files
  echo -e "/*.md\n/**/*.md\n/*.png\n/**/*.png\n/*.jpg\n/**/*.jpg\n/*.jpeg\n/**/*.jpeg\n/*.gif\n/**/*.gif\n/*.svg\n/**/*.svg" > "$GIT_DIR/info/sparse-checkout"
  
  # Reapply sparse-checkout
  git sparse-checkout reapply
  
  # Update the working directory
  git checkout
  
  cd - > /dev/null
  echo "✓ Configured sparse-checkout for $submodule_path"
}

# Configure each submodule
for submodule in "${SUBMODULES[@]}"; do
  if [ -d "$submodule" ]; then
    configure_sparse_checkout "$submodule"
  else
    echo "⚠ Warning: $submodule not found, skipping..."
  fi
done

echo ""
echo "✓ Sparse-checkout configuration complete!"
echo ""
echo "To update submodules in the future, run:"
echo "  git submodule update --remote"
echo ""
echo "To reapply sparse-checkout after updates:"
echo "  ./scripts/setup-submodules-sparse.sh"
