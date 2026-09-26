import { ReactNode } from 'react';

export default function PageHeading({ title, description, icon }: { title: string; description: string; icon: ReactNode }) {
  return (
    <header className="account-heading">
      <span className="account-heading-icon">{icon}</span>
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
    </header>
  );
}
