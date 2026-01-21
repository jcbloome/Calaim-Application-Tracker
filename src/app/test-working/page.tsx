export default function TestPage() {
  return (
    <div style={{ 
      padding: '2rem', 
      textAlign: 'center', 
      backgroundColor: '#ff0000', 
      color: 'white',
      fontSize: '2rem',
      fontWeight: 'bold'
    }}>
      🎉 THIS IS A TEST PAGE - IT WORKS! 🎉
      <br />
      <br />
      If you can see this RED page, then Next.js routing is working!
      <br />
      <br />
      Go to: http://localhost:3000/test-working
    </div>
  );
}