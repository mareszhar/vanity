rules({
  ':root': { colorScheme: 'light dark' },
  '*, *::before, *::after': { boxSizing: 'border-box' },
  'body': {
    ...t.text.body.$dec,
    margin: 0,
    fontFamily: t.font.sans,
    color: t.color.ink,
    background: t.color.canvas,
  },
})
