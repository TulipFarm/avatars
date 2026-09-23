const element = (name, attributes, children = []) => ({ type: 'element', name, attributes, children });

function grainPath(seed) {
  let state = seed;
  const coordinate = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 2 ** 32 * 31).toFixed(2);
  };
  return Array.from({ length: 96 }, () => `M${coordinate()} ${coordinate()}h.55v.55h-.55z`).join('');
}

const darkGrain = grainPath(19);
const lightGrain = grainPath(73);

export function backgroundLayers(circle) {
  const { cx, cy, r } = circle.attributes;
  const shape = { cx, cy, r };
  return [
    element('defs', {}, [
      element('linearGradient', {
        id: 'tf-background-wash', x1: '0', y1: '0', x2: '1', y2: '1',
      }, [
        element('stop', { offset: '0', 'data-stop-color': 'highlight', 'stop-opacity': '.08' }),
        element('stop', { offset: '1', 'data-stop-color': 'outline', 'stop-opacity': '.08' }),
      ]),
      element('pattern', {
        id: 'tf-background-grain', width: '32', height: '32', patternUnits: 'userSpaceOnUse',
      }, [
        element('path', { d: darkGrain, 'data-fill': 'outline', opacity: '.10' }),
        element('path', { d: lightGrain, 'data-fill': 'highlight', opacity: '.09' }),
      ]),
    ]),
    circle,
    element('circle', { ...shape, fill: 'url(#tf-background-wash)' }),
    element('circle', { ...shape, fill: 'url(#tf-background-grain)' }),
  ];
}
