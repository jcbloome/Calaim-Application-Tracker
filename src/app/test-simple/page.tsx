export default function TestSimplePage() {
  return (
    <div style={{ padding: '20px', fontFamily: 'Arial, sans-serif' }}>
      <h1>Simple Test Page</h1>
      <p>If you can see this, Next.js routing is working!</p>
      <p>Current time: {new Date().toLocaleString()}</p>
      <a href="/info" style={{ color: 'blue', textDecoration: 'underline' }}>
        Go to Info Page
      </a>
    </div>
  );
}