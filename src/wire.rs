//! Object-only JSON decoding shared by the native host and Rust core.
use serde::Deserialize;

#[derive(Deserialize)]
#[serde(transparent, bound(deserialize = "T: Deserialize<'de>"))]
pub(crate) struct Object<T>(#[serde(deserialize_with = "object")] pub T);

pub(crate) fn object<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    struct MapOnly<T>(std::marker::PhantomData<T>);
    impl<'de, T: Deserialize<'de>> serde::de::Visitor<'de> for MapOnly<T> {
        type Value = T;
        fn expecting(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            f.write_str("a JSON object")
        }
        fn visit_map<A: serde::de::MapAccess<'de>>(self, map: A) -> Result<T, A::Error> {
            T::deserialize(serde::de::value::MapAccessDeserializer::new(map))
        }
    }
    deserializer.deserialize_map(MapOnly(std::marker::PhantomData))
}

pub(crate) fn objects<'de, D, T>(deserializer: D) -> Result<Vec<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Vec::<Object<T>>::deserialize(deserializer).map(|v| v.into_iter().map(|Object(t)| t).collect())
}

// The binary and library compile this private module independently; only core
// request fields need nullable objects, while both use objects and Object.
#[allow(dead_code)]
pub(crate) fn optional_object<'de, D, T>(deserializer: D) -> Result<Option<T>, D::Error>
where
    D: serde::Deserializer<'de>,
    T: Deserialize<'de>,
{
    Option::<Object<T>>::deserialize(deserializer).map(|v| v.map(|Object(t)| t))
}
