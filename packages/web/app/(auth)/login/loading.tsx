export default function LoginLoading() {
  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-bold">Welcome back</h1>
        <p className="text-muted-foreground mt-2">
          Sign in to your AgentGate account
        </p>
      </div>
      <div>Loading...</div>
    </div>
  );
}
