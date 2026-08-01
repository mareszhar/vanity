import { createSystem } from '@mszr/vanity'

const open = createSystem()
const external = open.customProperty('--external-measure', { type: 'length' })

void open.oklch(open.percent(58), 0.2, open.angle.deg(285), 0.8)
void open.calc(open.length.rem(2)).add(open.length.px(4))
void open.rawValue.length('anchor-size(width)')
void external.$var(open.length.rem(4))
