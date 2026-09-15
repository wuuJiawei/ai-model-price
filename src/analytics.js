export function trackEvent(name, params = {}) {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

export function trackProviderClick(provider, modelId, status = 'active') {
  trackEvent('provider_click', {
    provider_id: provider.id || provider.provider_id,
    provider_name: provider.name || provider.provider_name,
    model_id: modelId || undefined,
    provider_status: status,
    destination: provider.website || undefined
  });
}
