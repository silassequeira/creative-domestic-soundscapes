using System.IO;
using UnityEngine;

public class RoomLoader : MonoBehaviour
{
<<<<<<< HEAD
    public string jsonFileName = "room.json";
    public Transform roomContainer;
    
    // Optional - set materials for different object types
    public Material defaultMaterial;
    public Material glassMaterial;
    public Material woodMaterial;
=======
    public string jsonFileName = "room.json"; // Certifica-te que está em Assets/StreamingAssets
>>>>>>> bb33b88959aa82680153772d48f5e6d602e5d1e9

    void Start()
    {
        LoadRoom();
    }

    void LoadRoom()
    {
        string filePath = Path.Combine(Application.streamingAssetsPath, jsonFileName);

        if (!File.Exists(filePath))
        {
<<<<<<< HEAD
            Debug.LogError("JSON file not found at: " + filePath);
=======
            Debug.LogError("Ficheiro JSON não encontrado em: " + filePath);
>>>>>>> bb33b88959aa82680153772d48f5e6d602e5d1e9
            return;
        }

        string jsonContent = File.ReadAllText(filePath);
<<<<<<< HEAD
        
        // Debug log to see the JSON content
        Debug.Log("Loading JSON content: " + jsonContent);
        
        RoomData roomData = JsonUtility.FromJson<RoomData>(jsonContent);

        if (roomData == null)
        {
            Debug.LogError("Failed to parse JSON data");
            return;
        }
        
        Debug.Log("Room name: " + roomData.environment.name);
        
        // Create container if not set
        if (roomContainer == null)
        {
            GameObject container = new GameObject("Room");
            roomContainer = container.transform;
        }

        // Create environment shapes (walls, floor, etc)
        if (roomData.environment.shapes != null)
        {
            GameObject envContainer = new GameObject("Environment");
            envContainer.transform.SetParent(roomContainer);
            
            foreach (ShapeData shape in roomData.environment.shapes)
            {
                CreateShape(shape, envContainer.transform);
            }
        }
        else
        {
            Debug.LogWarning("No environment shapes found in JSON");
        }

        // Create objects
        if (roomData.objects != null)
        {
            GameObject objectsContainer = new GameObject("Objects");
            objectsContainer.transform.SetParent(roomContainer);
            
            foreach (ShapeData obj in roomData.objects)
            {
                CreateShape(obj, objectsContainer.transform);
            }
        }
        else
        {
            Debug.LogWarning("No objects found in JSON");
        }
    }

    private void CreateShape(ShapeData shapeData, Transform parent)
    {
        // Debug info
        Debug.Log($"Creating shape: {shapeData.name}, shape: {shapeData.shape}");
        
        if (shapeData.shape == null)
        {
            Debug.LogError($"Shape type missing for {shapeData.name}");
            return;
        }

        PrimitiveType primitiveType;
        
        // Determine shape type
        switch (shapeData.shape.ToLower())
        {
            case "cube":
                primitiveType = PrimitiveType.Cube;
                break;
            case "sphere":
                primitiveType = PrimitiveType.Sphere;
                break;
            case "cylinder":
                primitiveType = PrimitiveType.Cylinder;
                break;
            case "capsule":
                primitiveType = PrimitiveType.Capsule;
                break;
            default:
                Debug.LogWarning($"Unknown shape type: {shapeData.shape}");
                return;
        }
        
        // Create game object
        GameObject newObject = GameObject.CreatePrimitive(primitiveType);
        newObject.name = shapeData.name;
        newObject.transform.SetParent(parent);
        
        // Set position
        if (shapeData.position != null)
        {
            newObject.transform.position = new Vector3(
                shapeData.position.x,
                shapeData.position.y,
                shapeData.position.z
            );
        }
        else
        {
            Debug.LogWarning($"No position data for {shapeData.name}");
        }
        
        // Set rotation
        if (shapeData.rotation != null)
        {
            newObject.transform.eulerAngles = new Vector3(
                shapeData.rotation.x,
                shapeData.rotation.y,
                shapeData.rotation.z
            );
        }
        
        // Set scale
        if (shapeData.size != null)
        {
            newObject.transform.localScale = new Vector3(
                shapeData.size.x,
                shapeData.size.y,
                shapeData.size.z
            );
        }
        else
        {
            Debug.LogWarning($"No size data for {shapeData.name}");
        }
        
        // Set color
        if (!string.IsNullOrEmpty(shapeData.color))
        {
            Renderer renderer = newObject.GetComponent<Renderer>();
            
            // Choose material based on object type
            if (shapeData.name.ToLower().Contains("window") && glassMaterial != null)
            {
                renderer.material = new Material(glassMaterial);
            }
            else if (shapeData.name.ToLower().Contains("door") && woodMaterial != null)
            {
                renderer.material = new Material(woodMaterial);
            }
            else if (defaultMaterial != null)
            {
                renderer.material = new Material(defaultMaterial);
            }
            
            // Parse and apply color
            Color color;
            if (ColorUtility.TryParseHtmlString(shapeData.color, out color))
            {
                renderer.material.color = color;
            }
            else
            {
                Debug.LogWarning($"Could not parse color: {shapeData.color}");
            }
        }
    }
}
=======
        RoomData roomData = JsonUtility.FromJson<RoomData>(jsonContent);

        // Criar paredes
        foreach (WallData wall in roomData.environment.walls)
        {
            GameObject newWall = GameObject.CreatePrimitive(PrimitiveType.Cube);
            newWall.name = wall.id;

            newWall.transform.position = new Vector3(wall.position[0], wall.position[1], wall.position[2]);
            newWall.transform.eulerAngles = new Vector3(wall.rotation[0], wall.rotation[1], wall.rotation[2]);
            newWall.transform.localScale = new Vector3(wall.width, wall.height, wall.depth);

            newWall.GetComponent<Renderer>().material.color = Color.gray;
        }

        // Criar chão
        FloorData floor = roomData.environment.floor;
        GameObject newFloor = GameObject.CreatePrimitive(PrimitiveType.Cube);
        newFloor.name = floor.id;

        newFloor.transform.position = new Vector3(floor.position[0], floor.position[1], floor.position[2]);
        newFloor.transform.eulerAngles = new Vector3(floor.rotation[0], floor.rotation[1], floor.rotation[2]);
        newFloor.transform.localScale = new Vector3(floor.width, floor.height, floor.depth);

        newFloor.GetComponent<Renderer>().material.color = Color.green;
    }
}
>>>>>>> bb33b88959aa82680153772d48f5e6d602e5d1e9
