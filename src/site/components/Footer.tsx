import { href } from '@/lib/router';
import { Icon } from '@/ui/Icon';
import { Logo } from '@/ui/Logo';
import { useNews } from '../data';
import { openTipLine } from './Tip';

export function Footer() {
  const { site, sections } = useNews();
  const s = site.settings;
  const social = Object.entries(s.social).filter(([, v]) => /^https?:\/\//i.test(v));
  return (
    <footer class="footer">
      <div class="wrap">
        <div class="footer-grid">
          <div class="stack" style={{ '--stack': '10px' }}>
            <div class="row" style={{ '--gap': '10px' }}><Logo size={36} /><strong class="footer-brand">{s.site.name}</strong></div>
            <p class="small">The student-run newspaper of {s.site.school}. Written, photographed, designed and published by the Newspaper Club.</p>
            <p class="small muted"><Icon name="pin" size={13} /> {s.site.address}</p>
          </div>
          <div>
            <h3>Sections</h3>
            <ul>{sections.map((x) => <li key={x.id}><a href={href(`/section/${x.id}`)}>{x.name}</a></li>)}</ul>
          </div>
          <div>
            <h3>The newsroom</h3>
            <ul>
              <li><a href={href('/staff')}>Meet the staff</a></li>
              <li><a href={href('/scores')}>Scores &amp; schedule</a></li>
              <li><a href={href('/about')}>About &amp; standards</a></li>
              {s.contact.email && <li><a href={`mailto:${s.contact.email}`}>Contact us</a></li>}
            </ul>
          </div>
          <div class="stack" style={{ '--stack': '10px' }}>
            <h3>Get involved</h3>
            <p class="small">Want to write, shoot, design or share a confidential tip?</p>
            {s.hotline.enabled && <button class="btn btn-gold" onClick={openTipLine}><Icon name="megaphone" size={15} /> Open the tip line</button>}
            {social.length > 0 && (
              <ul class="row socials">
                {social.map(([name, url]) => <li key={name}><a href={url} rel="noopener noreferrer" target="_blank">{name === 'x' ? 'X' : name[0].toUpperCase() + name.slice(1)}</a></li>)}
              </ul>
            )}
          </div>
        </div>
        <div class="footer-base">
          <span>© {new Date().getFullYear()} {s.site.name} · {s.site.school} Newspaper Club</span>
          <span><a href="#top" onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Back to top <Icon name="arrow-right" size={12} class="up" /></a></span>
        </div>
      </div>
    </footer>
  );
}
