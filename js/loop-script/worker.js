import toFinite from '../lib/to-finite.js'
import Context from '../dsp/context.js'
import render from '../dsp/render.js'

const worker = {
  fn: null,

  callbacks: {},

  callback ({ callback }) {
    this.callbacks[callback.id](callback.data)
  },

  async setup ({ context }) {
    context = new Context(context)
    const { filename, method, meta } = context

    const module = await import(filename)
    this.fn = module[method.name]

    if (method.type === 'AsyncFunction') {
      meta.setupStartTime = performance.now() / 1000
      this.fn = await this.fn(context)
      meta.setupDuration = performance.now() / 1000 - meta.setupStartTime
    }

    postMessage({ type: 'setup', context })
  },

  testFirstSample ({ context }) {
    context = new Context(context)
    context.firstSample = this.fn(context)
    postMessage({ type: 'setup', context })
  },

  render ({ context }) {
    context = new Context(context)

    if (context.firstSample != null) {
      context.n++ // first frame consumed
      if (!context.startIndex) context.startIndex = 0
      if (context.output.length === 1) {
        context.output[0][context.startIndex] = toFinite(context.firstSample)
      } else {
        for (const [channel, sample] of context.firstSample.entries()) {
          context.output[channel][context.startIndex] = toFinite(sample)
        }
      }
      context.startIndex++
    }

    render(this.fn, context)

    if (context.firstSample) {
      context.firstSample = null
      context.startIndex = 0
    }
    postMessage({ type: 'render', context })
  }
}

onmessage = ({ data }) => worker[data.type](data)
