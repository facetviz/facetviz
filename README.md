# FacetViz

FacetViz is a modular, dependency-free TypeScript and SVG visualization library
with a declarative configuration API.

**[Documentation](https://facetviz.github.io/facetviz/)** ·
**[Examples](https://facetviz.github.io/facetviz/examples.html)** ·
**[Playground](https://facetviz.github.io/facetviz/playground.html)**

Visit the documentation website for supported charts, configuration options,
themes, examples, and guides.

## Installation

```bash
npm install facetviz
```

## Quick start

```ts
import { FacetViz } from 'facetviz';

new FacetViz('#chart', {
  chart: { type: 'column' },
  title: { text: 'Fruit consumption' },
  xAxis: { categories: ['Apples', 'Pears', 'Bananas'] },
  series: [
    { name: 'Jane', data: [1, 5, 3] },
    { name: 'John', data: [4, 2, 6] },
  ],
});
```

![FacetViz quick-start column chart showing fruit consumption](docs/assets/quick-start.svg)

## Development

```bash
npm install
npm run build
npm test
npm run dev
```

## License

MIT
