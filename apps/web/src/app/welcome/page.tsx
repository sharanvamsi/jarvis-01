import { WelcomePage } from '@/components/welcome/WelcomePage';

export const metadata = {
  title: 'Jarvis - Your Academic Command Center',
  description: 'Sync Canvas, Gradescope, Ed Discussion, and Google Calendar into one dashboard. Never miss an assignment again.',
};

export default function Welcome() {
  return <WelcomePage />;
}
