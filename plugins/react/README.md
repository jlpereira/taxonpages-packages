# TaxonPages React Plugin

A TaxonPages plugin that enables the use of React components inside a Vue-based TaxonPages site. It provides a `VReactBridge` component that mounts and manages React component lifecycles within Vue templates.

## Installation

### Via npm

```bash
npm install @jlpereira/taxonpages-plugin-react
```

### Manual

Copy the `react/` folder into your project's `plugins/` directory:

```
plugins/
  react/
```

## Usage

Once installed, the plugin registers a global `VReactBridge` Vue component. Use it to render any React component:

```vue
<template>
  <VReactBridge :component="MyReactComponent" :props="{ title: 'Hello' }" />
</template>

<script setup>
import MyReactComponent from './MyReactComponent.jsx'
</script>
```

### Props

| Prop        | Type              | Required | Description                              |
| ----------- | ----------------- | -------- | ---------------------------------------- |
| `component` | Object / Function | Yes      | The React component to render            |
| `props`     | Object            | No       | Props to pass to the React component     |

## How it works

1. **Plugin registration** — The plugin entry point (`plugin.js`) hooks into the TaxonPages build system. The `vueSetup.js` file registers `VReactBridge` as a global Vue component.

2. **Mounting** — When `VReactBridge` mounts, it creates a React root via `createRoot` on a container `<div>` and renders the provided React component.

3. **Reactivity** — The bridge watches the `component` and `props` for changes and re-renders the React tree when they update.

4. **Cleanup** — On unmount, the React root is properly destroyed to prevent memory leaks.

## Project structure

```
react/
├── plugin.js                       # Plugin entry point (Vite/build config)
├── vueSetup.js                     # Registers VReactBridge as a global component
├── package.json
└── components/
    └── VReactBridge.vue            # Vue wrapper that mounts React components
```

## License

MIT
