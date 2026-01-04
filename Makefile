.PHONY: build build-wasm build-ts setup publish clean help

help:
	@echo "Available targets:"
	@echo "  setup      - Install dependencies and setup project"
	@echo "  build      - Build both WASM and TypeScript"
	@echo "  build-wasm - Build only the Zellij WASM plugin"
	@echo "  build-ts   - Build only the TypeScript"
	@echo "  publish    - Publish to npm"
	@echo "  clean      - Clean build artifacts"

setup:
	bun install
	@if ! rustup target list --installed | grep -q wasm32-wasip1; then \
		echo "Adding wasm32-wasip1 target..."; \
		rustup target add wasm32-wasip1; \
	fi

build: build-wasm build-ts

build-wasm:
	@echo "Building Zellij WASM plugin..."
	cd zellij-plugin && cargo build --release
	cp zellij-plugin/target/wasm32-wasip1/release/opencode-zellij.wasm assets/opencode-zellij.wasm
	@echo "WASM plugin built: assets/opencode-zellij.wasm"

build-ts:
	@echo "Building TypeScript..."
	npm run build
	@echo "TypeScript built: dist/"

publish: build
	npm publish --access public

clean:
	cd zellij-plugin && cargo clean
	rm -rf node_modules dist
	rm -f assets/opencode-zellij.wasm
