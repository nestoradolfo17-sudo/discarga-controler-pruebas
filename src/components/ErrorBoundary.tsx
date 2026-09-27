import React from 'react';

// Pantalla de recuperación (análisis, punto 12): si una parte de la app falla
// por un error inesperado, antes toda la pantalla quedaba en blanco y el
// operador no podía hacer nada. Ahora se muestra este aviso con un botón para
// recargar; los datos ya guardados en la base compartida no se pierden.
interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Error inesperado en la aplicación:', error, info?.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white max-w-md w-full rounded-2xl shadow-xl border border-slate-200 p-6 space-y-4 text-center">
          <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto text-2xl font-bold">
            !
          </div>
          <h1 className="font-bold text-slate-900 text-lg">Ocurrió un problema en la pantalla</h1>
          <p className="text-sm text-slate-600">
            Lo que ya estaba guardado no se perdió. Toca <strong>Recargar</strong> para volver a la aplicación.
            Si vuelve a pasar, avisa al administrador indicando qué estabas haciendo.
          </p>
          <p className="text-[11px] text-slate-400 font-mono break-words">{this.state.error.message}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="w-full min-h-[48px] rounded-xl bg-slate-900 text-white font-semibold cursor-pointer active:scale-95"
          >
            Recargar
          </button>
        </div>
      </div>
    );
  }
}
