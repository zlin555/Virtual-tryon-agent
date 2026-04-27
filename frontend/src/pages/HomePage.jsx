import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

const features = [
  {
    icon: '✦',
    title: 'AI-Powered Style Matching',
    desc: "Describe your aesthetic in plain words. Our LLM extracts your latent taste profile and surfaces clothes you'll actually love.",
  },
  {
    icon: '◈',
    title: 'Realistic Virtual Try-On',
    desc: "See any garment on your own photo before you buy — powered by FASHN's state-of-the-art diffusion model.",
  },
  {
    icon: '◎',
    title: 'Conversational Shopping',
    desc: 'Refine your search in natural language. Our agent understands "something more casual" or "for a rooftop dinner".',
  },
]

const steps = [
  { num: '01', label: 'Describe', caption: 'Tell us your style in words or show us reference images.' },
  { num: '02', label: 'Discover', caption: 'The agent surfaces outfit candidates ranked to your taste.' },
  { num: '03', label: 'Visualize', caption: 'Try any piece on your own photo — instantly.' },
  { num: '04', label: 'Decide', caption: "Shop with confidence. No more guessing how it'll look on you." },
]

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: (i) => ({ opacity: 1, y: 0, transition: { delay: i * 0.1, duration: 0.5, ease: 'easeOut' } }),
}

export default function HomePage() {
  return (
    <div className="min-h-screen">

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section
        className="relative min-h-screen flex items-center justify-center overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #1A1A1A 0%, #3D2B2B 50%, #5C3A3A 100%)',
        }}
      >
        {/* Decorative blurs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-20 blur-3xl"
          style={{ background: 'radial-gradient(circle, #C97B84, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 rounded-full opacity-15 blur-3xl"
          style={{ background: 'radial-gradient(circle, #E8B4BA, transparent)' }} />

        <div className="relative z-10 text-center px-6 max-w-3xl mx-auto">
          <motion.p
            initial={{ opacity: 0, letterSpacing: '0.3em' }}
            animate={{ opacity: 1, letterSpacing: '0.5em' }}
            transition={{ duration: 1 }}
            className="text-xs uppercase tracking-[0.5em] text-rose-light mb-8"
            style={{ color: '#E8B4BA' }}
          >
            Virtual Try-On &nbsp;·&nbsp; AI Fashion Agent
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="text-6xl md:text-8xl font-serif leading-none text-white mb-6"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            See yourself<br />
            <em className="not-italic" style={{ color: '#C97B84' }}>in it.</em>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="text-lg text-white/70 mb-12 leading-relaxed"
          >
            Describe your style, discover outfits curated just for you,<br className="hidden md:block" />
            and try them on your own photo — before you buy.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="flex flex-col sm:flex-row gap-4 justify-center"
          >
            <Link
              to="/try-on"
              className="px-8 py-4 rounded-full text-white font-medium transition-all duration-300 hover:scale-105 hover:shadow-2xl"
              style={{ background: '#C97B84' }}
            >
              Try It On ✦
            </Link>
            <Link
              to="/style"
              className="px-8 py-4 rounded-full font-medium transition-all duration-300 hover:scale-105"
              style={{ border: '1px solid rgba(255,255,255,0.3)', color: 'white' }}
            >
              Find My Style →
            </Link>
          </motion.div>
        </div>

        {/* Scroll hint */}
        <motion.div
          className="absolute bottom-10 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 8, 0] }}
          transition={{ repeat: Infinity, duration: 2 }}
        >
          <div className="w-px h-16 mx-auto" style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.5), transparent)' }} />
        </motion.div>
      </section>

      {/* ── Feature trio ─────────────────────────────────────── */}
      <section className="py-28 px-6" style={{ backgroundColor: '#FAF7F2' }}>
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial="hidden" whileInView="show" viewport={{ once: true }}
            variants={fadeUp} custom={0}
            className="text-4xl md:text-5xl font-serif text-center mb-4"
            style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
          >
            Why it stands out
          </motion.h2>
          <motion.p
            initial="hidden" whileInView="show" viewport={{ once: true }}
            variants={fadeUp} custom={1}
            className="text-center mb-16"
            style={{ color: '#8C7B75' }}
          >
            Three capabilities that change how you shop for fashion online.
          </motion.p>

          <div className="grid md:grid-cols-3 gap-8">
            {features.map((f, i) => (
              <motion.div
                key={f.title}
                initial="hidden" whileInView="show" viewport={{ once: true }}
                variants={fadeUp} custom={i + 2}
                whileHover={{ y: -6, boxShadow: '0 16px 40px rgba(139,90,80,0.14)' }}
                className="p-8 rounded-2xl transition-all duration-300 cursor-default"
                style={{ backgroundColor: '#F0EBE3', boxShadow: '0 2px 16px rgba(139,90,80,0.08)' }}
              >
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center text-xl mb-6"
                  style={{ backgroundColor: '#E8B4BA', color: '#A55E67' }}
                >
                  {f.icon}
                </div>
                <h3 className="text-xl font-serif mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {f.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: '#8C7B75' }}>
                  {f.desc}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────── */}
      <section className="py-28 px-6" style={{ backgroundColor: '#1A1A1A' }}>
        <div className="max-w-5xl mx-auto">
          <motion.h2
            initial="hidden" whileInView="show" viewport={{ once: true }}
            variants={fadeUp} custom={0}
            className="text-4xl md:text-5xl font-serif text-center mb-20 text-white"
            style={{ fontFamily: "'Playfair Display', serif" }}
          >
            How it works
          </motion.h2>

          <div className="grid md:grid-cols-4 gap-0 relative">
            {/* connector line */}
            <div className="hidden md:block absolute top-6 left-[12.5%] right-[12.5%] h-px" style={{ backgroundColor: '#3D2B2B' }} />

            {steps.map((s, i) => (
              <motion.div
                key={s.num}
                initial="hidden" whileInView="show" viewport={{ once: true }}
                variants={fadeUp} custom={i}
                className="flex flex-col items-center text-center px-4"
              >
                <div
                  className="relative z-10 w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium mb-5"
                  style={{ backgroundColor: '#C97B84', color: 'white' }}
                >
                  {s.num}
                </div>
                <p className="font-serif text-lg mb-2 text-white" style={{ fontFamily: "'Playfair Display', serif" }}>
                  {s.label}
                </p>
                <p className="text-xs leading-relaxed" style={{ color: '#8C7B75' }}>
                  {s.caption}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA banner ───────────────────────────────────────── */}
      <section
        className="py-28 px-6 text-center"
        style={{ background: 'linear-gradient(135deg, #F0EBE3 0%, #FAF7F2 100%)' }}
      >
        <motion.h2
          initial="hidden" whileInView="show" viewport={{ once: true }}
          variants={fadeUp} custom={0}
          className="text-4xl md:text-5xl font-serif mb-6"
          style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
        >
          Your wardrobe, reimagined.
        </motion.h2>
        <motion.p
          initial="hidden" whileInView="show" viewport={{ once: true }}
          variants={fadeUp} custom={1}
          className="mb-10 text-lg" style={{ color: '#8C7B75' }}
        >
          Start with a quick try-on or let the AI build your style profile.
        </motion.p>
        <motion.div
          initial="hidden" whileInView="show" viewport={{ once: true }}
          variants={fadeUp} custom={2}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <Link
            to="/try-on"
            className="px-10 py-4 rounded-full text-white font-medium transition-all duration-300 hover:scale-105"
            style={{ backgroundColor: '#C97B84' }}
          >
            Quick Try-On ✦
          </Link>
          <Link
            to="/style"
            className="px-10 py-4 rounded-full font-medium border transition-all duration-300 hover:scale-105"
            style={{ borderColor: '#C97B84', color: '#C97B84' }}
          >
            Explore My Style →
          </Link>
        </motion.div>
      </section>

    </div>
  )
}
