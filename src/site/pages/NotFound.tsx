import { href } from '@/lib/router';
import { Empty } from '@/ui/States';

export function NotFound() {
  return (
    <Empty icon="help" title="We couldn’t find that page">
      The story may have been moved, or the link might be mistyped. <a href={href('/')}>Head back to the front page.</a>
    </Empty>
  );
}
