import './FeedPage.css'
import { type FC, useEffect, useState } from 'react'
import { Button, Spinner } from 'react-bootstrap'
import { useNavigate, useParams } from 'react-router-dom'
import { type TitrationPair, getFeedItem } from '../modules/titrationApi'
import { ROUTES } from '../Routes'

const defaultVideo = '/DefaultVideo.mp4'

// Первое предложение описания показывается сразу, остальное — по кнопке «Ещё»
const splitDescription = (description: string) => {
  const end = description.search(/[.!?…](?:\s|$)/)
  if (end === -1 || end >= description.length - 1) return { short: description, extra: '' }
  return { short: description.slice(0, end + 1), extra: description.slice(end + 1).trim() }
}

const FeedPage: FC = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [item, setItem] = useState<TitrationPair | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    getFeedItem(id).then((data) => {
      setItem(data)
      setExpanded(false)
      setLoading(false)
    })
  }, [id])

  const handleNext = () => {
    if (!item) return
    getFeedItem(String(item.id), true).then((next) => {
      if (next) navigate(`${ROUTES.FEED}/${next.id}`)
    })
  }

  if (loading) {
    return (
      <div className="feedLoader">
        <Spinner animation="border" variant="light" />
      </div>
    )
  }

  if (!item) {
    return <div className="feedLoader">Услуга не найдена</div>
  }

  const { short, extra } = splitDescription(item.description ?? '')

  return (
    <div className="feedScreen">
      <header className="feedHeader">
        <h2>🧪 Labster Feed</h2>
      </header>

      <div className="feedMediaWrapper">
        <video
          key={item.id}
          className="feedMedia"
          src={item.video_url || defaultVideo}
          autoPlay
          loop
          muted
          playsInline
        />

        <div className="feedOverlay">
          <div className="feedActions">
            <span className="likeLarge">❤️ {item.likes_count}</span>
            <Button className="btnNext" title="Следующий" aria-label="Следующий" onClick={handleNext}>
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </Button>
          </div>

          <h3>{item.title}</h3>

          {short && <p className="descText">{short}</p>}
          {extra && expanded && <p className="descText">{extra}</p>}
          {extra && (
            <Button variant="link" className="btnMoreDesc" onClick={() => setExpanded((state) => !state)}>
              {expanded ? 'Скрыть' : 'Ещё'}
            </Button>
          )}

          <div className="statsRow">
            <span>🧪 pH: {item.ph}</span>
            <span>💧 {item.concentration} М</span>
          </div>
        </div>
      </div>
    </div>
  )
}

export default FeedPage
