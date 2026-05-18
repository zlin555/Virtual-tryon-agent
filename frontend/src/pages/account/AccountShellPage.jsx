import { motion } from 'framer-motion'
import { useLanguage } from '../../context/LanguageContext'

export default function AccountShellPage({ section }) {
  const { t } = useLanguage()
  const COPY = {
    purchase: {
      eyebrow: t('account.purchaseEyebrow'),
      title: t('account.purchaseTitle'),
      description: t('account.purchaseDescription'),
    },
    tokens: {
      eyebrow: t('account.tokensEyebrow'),
      title: t('account.tokensTitle'),
      description: t('account.tokensDescription'),
    },
    settings: {
      eyebrow: t('account.settingsEyebrow'),
      title: t('account.settingsTitle'),
      description: t('account.settingsDescription'),
    },
  }
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
              title: t('account.experiencePlaceholder'),
              body: t('account.experienceBody'),
            },
            {
              title: t('account.backendHook'),
              body: t('account.backendHookBody'),
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
