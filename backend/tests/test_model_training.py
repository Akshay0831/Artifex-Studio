import pytest
import torch
from torch.utils.data import DataLoader, TensorDataset

from ai_models.model_training import CustomModelTrainer, TrainingConfig


def test_training_requires_model_setup(tmp_path):
    trainer = CustomModelTrainer(TrainingConfig(save_dir=str(tmp_path)))
    loader = DataLoader(TensorDataset(torch.empty(0, 1), torch.empty(0, dtype=torch.long)))

    with pytest.raises(RuntimeError, match="SetupModel"):
        trainer.Train(loader)


def test_training_with_validation_saves_checkpoints(tmp_path):
    loader = DataLoader(
        TensorDataset(
            torch.tensor([[1.0, 0.0], [0.0, 1.0]]),
            torch.tensor([0, 1]),
        ),
        batch_size=2,
    )
    trainer = CustomModelTrainer(
        TrainingConfig(
            epochs=1,
            log_interval=1,
            early_stopping_patience=2,
            save_dir=str(tmp_path),
        )
    )
    trainer.SetupModel(torch.nn.Linear(2, 2), torch.nn.CrossEntropyLoss())

    metrics = trainer.Train(loader, loader)

    assert len(metrics) == 1
    assert metrics[0].val_loss is not None
    assert (tmp_path / "best_epoch_1.pt").exists()
    assert (tmp_path / "training_metrics.json").exists()
