import neostandard from 'neostandard'

export default [
  ...neostandard(),
  {
    rules: {
      indent: ['error', 4, { SwitchCase: 1 }]
    }
  }
]
