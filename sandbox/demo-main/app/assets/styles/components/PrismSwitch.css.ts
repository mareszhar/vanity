const { anatomy, t } = ds

// An anatomy: the track and knob both answer to the root's checked state through
// part-scoped conditions, so one `data-state` on the button drives every part.
export const control = anatomy({
  parts: ['root', 'track', 'knob'],
  base: {
    root: {
      ...t.text.label.$dec,
      display: 'inline-flex',
      alignItems: 'center',
      gap: t.space.sm,
      color: t.color.ink,
      background: 'transparent',
      border: 0,
      padding: 0,
      cursor: 'pointer',
      ...focusRing({ color: t.color.brand }),
    },
    track: {
      'position': 'relative',
      'inlineSize': '2.7rem',
      'blockSize': '1.55rem',
      'flex': '0 0 auto',
      'borderRadius': t.radius.pill,
      'background': t.color.borderStrong,
      'transitionProperty': 'background-color',
      'transitionDuration': t.duration.quick,
      'transitionTimingFunction': t.ease.standard,
      'root:checked': { background: t.color.brand },
    },
    knob: {
      'position': 'absolute',
      'insetBlockStart': '50%',
      'insetInlineStart': '0.2rem',
      'inlineSize': '1.15rem',
      'blockSize': '1.15rem',
      'borderRadius': '50%',
      'background': t.color.raised,
      'boxShadow': '0 1px 3px oklch(0 0 0 / 0.28)',
      'translate': '0 -50%',
      'transitionProperty': 'translate',
      'transitionDuration': t.duration.base,
      'transitionTimingFunction': t.ease.emphasized,
      'root:checked': { translate: 'calc(2.7rem - 1.15rem - 0.4rem) -50%' },
    },
  },
})
