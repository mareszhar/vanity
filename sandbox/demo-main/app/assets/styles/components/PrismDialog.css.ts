const { anatomy, keyframes, t } = ds

const fade = keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })
const rise = keyframes({
  from: { opacity: 0, transform: 'translateY(12px) scale(0.98)' },
  to: { opacity: 1, transform: 'translateY(0) scale(1)' },
})

export const dialog = anatomy({
  parts: ['backdrop', 'positioner', 'content', 'header', 'title', 'body', 'footer', 'close'],
  base: {
    backdrop: {
      position: 'fixed',
      inset: 0,
      zIndex: 40,
      background: t.color.scrim,
      supportsBackdrop: { backdropFilter: 'blur(4px)' },
      open: { motionOk: { animation: `${fade} ${t.duration.quick} ${t.ease.standard}` } },
    },
    positioner: {
      position: 'fixed',
      inset: 0,
      zIndex: 41,
      display: 'grid',
      placeItems: 'center',
      padding: t.space.md,
    },
    content: {
      display: 'grid',
      gap: t.space.md,
      inlineSize: 'min(100%, 32rem)',
      maxBlockSize: 'calc(100dvh - 2rem)',
      overflowY: 'auto',
      padding: t.space.lg,
      background: t.color.overlay,
      border: `1px solid ${t.color.border}`,
      borderRadius: t.radius.lg,
      boxShadow: t.shadow.panel,
      open: { motionOk: { animation: `${rise} ${t.duration.base} ${t.ease.emphasized}` } },
    },
    header: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: t.space.md },
    title: { ...t.text.title.$dec, margin: 0 },
    body: { ...t.text.body.$dec, display: 'grid', gap: t.space.sm, margin: 0, color: t.color.inkMuted, textWrap: 'pretty' },
    footer: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: t.space.sm },
    close: {
      display: 'grid',
      placeItems: 'center',
      inlineSize: t.size.controlSm,
      blockSize: t.size.controlSm,
      flex: '0 0 auto',
      border: 0,
      borderRadius: t.radius.sm,
      background: 'transparent',
      color: t.color.inkMuted,
      fontSize: '1.1rem',
      lineHeight: 1,
      cursor: 'pointer',
      hover: { background: t.color.brandSoft, color: t.color.brand },
      ...focusRing({ color: t.color.brand }),
    },
  },
})
