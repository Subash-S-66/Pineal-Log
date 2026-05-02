import './globals.css';

export const metadata = {
  title: 'PinealLog',
  description: 'HOS Alliance · Server 1895 - Stamina Tracker',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
