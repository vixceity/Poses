"""Camera-space xyz poses, centered at the hips and scaled by torso length."""
import numpy as np

JOINTS = (11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28)
EDGES = ((0, 1), (0, 2), (2, 4), (1, 3), (3, 5), (0, 6),
         (1, 7), (6, 7), (6, 8), (8, 10), (7, 9), (9, 11))


def normalize(world, image):
    """Return 24x3 matrix, or None if any required joint is unreliable/offscreen.

    Rows 0–11: shoulders, elbows, wrists, hips, knees, ankles (left then right).
    Rows 12–23: end-minus-start limb vectors in EDGES order.
    No rotation/reflection alignment: orientation and left/right are meaningful.
    """
    if len(world) != 33 or len(image) != 33:
        return None
    for i in JOINTS:
        if (image[i].visibility < 0.65 or image[i].presence < 0.65 or
                not 0 <= image[i].x <= 1 or not 0 <= image[i].y <= 1):
            return None
    xyz = np.array([[world[i].x, world[i].y, world[i].z] for i in JOINTS])
    if not np.isfinite(xyz).all():
        return None
    hips = (xyz[6] + xyz[7]) / 2
    scale = np.linalg.norm((xyz[0] + xyz[1]) / 2 - hips)
    if scale < 0.08:
        return None
    joints = (xyz - hips) / scale
    limbs = np.array([joints[b] - joints[a] for a, b in EDGES])
    matrix = np.concatenate((joints, limbs))
    return matrix.tolist() if np.max(np.abs(matrix)) <= 20 else None


def assign_lanes(image_poses):
    """Stable player IDs by screen lane. Ambiguous lanes produce no observation.

    P1 stays in the left half of the unmirrored preview, P2 in the right.
    The center dead zone prevents noisy hips from jumping between IDs.
    """
    lanes = {1: [], 2: []}
    for index, pose in enumerate(image_poses):
        if len(pose) != 33 or min(pose[23].visibility, pose[24].visibility) < 0.65:
            continue
        x = (pose[23].x + pose[24].x) / 2
        if x < 0.46:
            lanes[1].append(index)
        elif x > 0.54:
            lanes[2].append(index)
    return {player: indices[0] if len(indices) == 1 else None for player, indices in lanes.items()}
