import { motion } from 'framer-motion'

const COPY = {
  purchase: {
    eyebrow: 'Purchase History',
    title: 'Your future purchase archive',
    description: 'Orders, reorder paths, and style follow-ups can live here once checkout and product ownership are connected.',
  },
  tokens: {
    eyebrow: 'Token Purchase',
    title: 'Credits and usage will land here',
    description: 'This page is ready for try-on credits, premium memory tiers, and any future balance or billing controls.',
  },
  settings: {
    eyebrow: 'Settings',
    title: 'A clean home for account controls',
    description: 'Profile controls, avatar preferences, notification settings, and memory permissions can expand here later.',
  },
}

export default function AccountShellPage({ section }) {
  const content = COPY[section] || COPY.settings

  return (
    <div className="min-h-screen px-6 py-16" style={{ backgroundColor: '#FAF7F2' }}>
      <div className="max-w-5xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
          <p className="text-xs uppercase tracking-[0.3em]" style={{ color: '#C97B84' }}>
            {content.eyebrow}
          </p>
          <h1
            className="mt-4 text-5xl font-serif"
            style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
          >
            {content.title}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-8" style={{ color: '#746761' }}>
            {content.description}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08 }}
          className="mt-10 grid md:grid-cols-2 gap-6"
        >
          {[
            {
              title: 'Experience placeholder',
              body: 'The route, layout, and visual language are in place now, so we can plug in real account data next without rebuilding the page structure.',
            },
            {
              title: 'Next backend hook',
              body: 'When you are ready, this section can connect directly to the matching API endpoints and database tables for the selected account feature.',
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-[28px] border p-7"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.75) 0%, rgba(244,238,230,0.95) 100%)',
                borderColor: '#E8D7CC',
                boxShadow: '0 16px 34px rgba(139,90,80,0.07)',
              }}
            >
              <h2
                className="text-2xl font-serif"
                style={{ fontFamily: "'Playfair Display', serif", color: '#1A1A1A' }}
              >
                {card.title}
              </h2>
              <p className="mt-3 text-sm leading-7" style={{ color: '#746761' }}>
                {card.body}
              </p>
            </div>
          ))}
        </motion.div>
      </div>
    </div>
  )
}
