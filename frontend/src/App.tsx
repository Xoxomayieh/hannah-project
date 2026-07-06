import { useState } from "react";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ViewportStage } from "@/features/stage/ViewportStage";
import { ChatDock } from "@/features/rig/ChatDock";

function App() {
  const [booted, setBooted] = useState(false);
  const [loadProgress, setLoadProgress] = useState(0);
  const [isReady, setIsReady] = useState(false);

  return (
    <>
      {!booted && (
        <LoadingScreen 
          progress={loadProgress}
          isReady={isReady}
          onComplete={() => setBooted(true)} 
        />
      )}
      <ViewportStage 
        onProgress={setLoadProgress}
        onReady={() => setIsReady(true)}
        booted={booted}
      />
      <ChatDock />
    </>
  );
}

export default App;
