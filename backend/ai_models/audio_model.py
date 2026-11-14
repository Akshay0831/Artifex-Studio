"""Explicit audio-generation availability contract."""

from typing import Optional, Dict, Any

import torch


class AudioGenerationUnavailableError(RuntimeError):
    """Raised when no real audio-generation backend is configured."""


class AudioModel:
    """Audio generation interface; no production backend is configured yet."""

    def GetPipeline(self, model_type: str = "base") -> Any:
        raise AudioGenerationUnavailableError(
            "Audio generation is unavailable: no real audio model backend is configured "
            f"for model type {model_type!r}."
        )
    
    def Generate(
        self, 
        prompt: str, 
        duration: float = 5.0,
        sample_rate: int = 22050,
        seed: Optional[int] = None
    ) -> Dict[str, Any]:
        """Generate audio, or raise when no production backend is configured.

        Args:
            prompt: Text description of the audio.
            duration: Requested duration in seconds.
            sample_rate: Requested audio sample rate.
            seed: Optional random seed for reproducibility.

        Raises:
            AudioGenerationUnavailableError: No production backend is configured.
        """
        raise AudioGenerationUnavailableError(
            "Audio generation is unavailable: no real audio model backend is configured."
        )
    
    def ClearPipeline(self):
        """Clear the pipeline to free memory"""
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

# Global instance
_audio_model = None

def get_audio_model() -> AudioModel:
    """Get global audio model instance"""
    global _audio_model
    if _audio_model is None:
        _audio_model = AudioModel()
    return _audio_model

if __name__ == "__main__":
    # Test the audio model
    audio_model = get_audio_model()
    result = audio_model.Generate("background music", duration=3.0)
    print(f"✅ Audio generation test passed: {result['duration']}s @ {result['sample_rate']}Hz")