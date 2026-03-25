import "./globals.css";

export const metadata = {
  title: "Frameforge Recorder",
  description: "Record screen + webcam + microphone in one file.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
