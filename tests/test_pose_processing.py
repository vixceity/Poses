from types import SimpleNamespace
import numpy as np
from pose_processing import normalize, assign_lanes, quality_issue


def test_moderate_confidence_allowed_but_hidden_joint_explained():
    image = landmarks()
    image[15].visibility = 0.5
    assert normalize(landmarks(), image) is not None
    image[15].visibility = 0.2
    assert 'left wrist' in quality_issue(image)
    assert normalize(landmarks(), image) is None


def landmarks():
    p = [SimpleNamespace(x=0.3, y=0.5, z=0., presence=1., visibility=1.) for _ in range(33)]
    p[11].y = p[12].y = 0.2
    return p


def test_translation_and_scale_invariance():
    image = landmarks()
    world = landmarks()
    baseline = normalize(world, image)
    for p in world:
        p.x = p.x * 2 + 4
        p.y = p.y * 2 - 3
        p.z = p.z * 2 + 7
    np.testing.assert_allclose(normalize(world, image), baseline, atol=1e-12)
    assert np.asarray(baseline).shape == (24, 3)
    np.testing.assert_allclose((np.array(baseline[6]) + baseline[7]) / 2, 0)


def test_hidden_joint_and_degenerate_torso_rejected():
    image = landmarks()
    image[15].visibility = 0.1
    assert normalize(landmarks(), image) is None
    world = landmarks()
    world[11].y = world[12].y = 0.5
    assert normalize(world, landmarks()) is None


def test_lanes_ignore_detection_order_and_reject_ambiguity():
    left, right = landmarks(), landmarks()
    right[23].x = right[24].x = 0.8
    assert assign_lanes([right, left]) == {1: 0, 2: 1}
    assert assign_lanes([left, landmarks(), right]) == {1: 2, 2: None}
